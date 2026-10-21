import { validateDependencies } from "../config/validation";
import { probeReady } from "./readiness";
import { statSync } from "node:fs";
import { internalCommand } from "../runtime/launch";
import type { ServiceDefinition } from "../config/types";
import type { OutputEvent, ServiceSnapshot } from "./types";

interface Session {
  definition: ServiceDefinition;
  snapshot: ServiceSnapshot;
  process?: Bun.Subprocess;
  group?: number;
  commandDone?: Promise<void>;
  finishCommand?: () => void;
  history: Uint8Array;
  readyOutput?: string;
  readyDecoder?: TextDecoder;
  pending?: Promise<void>;
  intent: number;
  cols: number;
  rows: number;
}
const encoder = new TextEncoder();
function directoryIssue(cwd: string): string | null {
  try {
    if (statSync(cwd).isDirectory()) return null;
  } catch {}
  return `Directory is unavailable: ${cwd}. Edit this service to choose an existing directory.`;
}
function groupAlive(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}
function signalGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
  }
}

export function createProcessManager(
  definitions: ServiceDefinition[],
  options: { stopTimeoutMs?: number } = {},
) {
  const sessions = new Map<string, Session>();
  const starts = new Map<
    string,
    { promise: Promise<void>; controller: AbortController }
  >();
  const listeners = new Set<() => void>();
  const outputListeners = new Set<(e: OutputEvent) => void>();
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;
  const changed = () => {
    for (const listener of listeners) listener();
  };
  function get(id: string) {
    const s = sessions.get(id);
    if (!s) throw new Error(`Unknown service: ${id}`);
    return s;
  }
  function emit(s: Session, bytes: Uint8Array) {
    if (s.snapshot.readiness === "waiting")
      s.readyOutput = (
        (s.readyOutput ?? "") + s.readyDecoder!.decode(bytes, { stream: true })
      ).slice(-1048576);
    // Native emulator consumes output synchronously; only pre-mount/reconnect history is buffered.
    const keep = 1_048_576;
    const old = s.history;
    const result = new Uint8Array(Math.min(keep, old.length + bytes.length));
    if (bytes.length >= keep) result.set(bytes.subarray(bytes.length - keep));
    else {
      const n = Math.min(old.length, keep - bytes.length);
      result.set(old.subarray(old.length - n));
      result.set(bytes, n);
    }
    s.history = result;
    for (const listener of outputListeners)
      listener({
        id: s.definition.id,
        generation: s.snapshot.generation,
        bytes,
      });
  }
  function updateDefinitions(defs: ServiceDefinition[]) {
    validateDependencies(defs);
    const ids = new Set(defs.map((d) => d.id));
    for (const [id, s] of sessions)
      if (!ids.has(id)) {
        if (s.group && groupAlive(s.group))
          throw new Error(`Stop ${id} before removing it`);
        s.process?.terminal?.close();
        sessions.delete(id);
      }
    for (const definition of defs) {
      const existing = sessions.get(definition.id);
      if (existing) existing.definition = definition;
      else
        sessions.set(definition.id, {
          definition,
          snapshot: {
            id: definition.id,
            state: "stopped",
            exitCode: null,
            error: null,
            pid: null,
            generation: 0,
          },
          history: new Uint8Array(),
          intent: 0,
          cols: 80,
          rows: 24,
        });
    }
    for (const definition of defs) {
      const session = get(definition.id);
      if (session.group || session.snapshot.state === "running") continue;
      const issue = directoryIssue(definition.cwd);
      if (issue)
        session.snapshot = {
          ...session.snapshot,
          state: "error",
          error: issue,
        };
      else if (session.snapshot.error?.startsWith("Directory is unavailable:"))
        session.snapshot = {
          ...session.snapshot,
          state: "stopped",
          error: null,
        };
    }
    changed();
  }
  async function stopSession(s: Session) {
    if (s.snapshot.state === "stopped" && !s.group) return;
    s.snapshot = { ...s.snapshot, state: "stopping" };
    changed();
    if (s.group && s.process && s.process.exitCode === null) {
      signalGroup(s.group, "SIGINT");
      const timeout = setTimeout(
        () => s.finishCommand?.(),
        options.stopTimeoutMs ?? 5000,
      );
      try {
        await s.commandDone;
      } finally {
        clearTimeout(timeout);
      }
      // The live anchor still owns the PGID while remaining descendants exit.
      await Bun.sleep(20);
      if (s.group && s.process.exitCode === null)
        signalGroup(s.group, "SIGKILL");
    }
    if (s.process) await s.process.exited;
    s.process?.terminal?.close();
    s.process = undefined;
    s.group = undefined;
    s.snapshot = {
      ...s.snapshot,
      state: "stopped",
      waitingFor: undefined,
      pid: null,
      endedAt: s.snapshot.endedAt ?? Date.now(),
      readiness: undefined,
    };
    changed();
  }
  function serialize(s: Session, fn: () => Promise<void>) {
    const next = (s.pending ?? Promise.resolve()).catch(() => {}).then(fn);
    s.pending = next;
    return next;
  }
  async function startSession(s: Session, signal: AbortSignal) {
    if (shuttingDown || signal.aborted) return;
    if (s.snapshot.state === "running" || s.snapshot.state === "starting")
      return;
    if (s.group) await stopSession(s);
    if (shuttingDown || signal.aborted) return;
    const definition = s.definition;
    s.readyOutput = "";
    s.readyDecoder = new TextDecoder();
    s.snapshot = {
      ...s.snapshot,
      state: "starting",
      exitCode: null,
      error: null,
      generation: s.snapshot.generation + 1,
      startedAt: Date.now(),
      endedAt: undefined,
      readiness: definition.ready ? "waiting" : undefined,
    };
    changed();
    const generation = s.snapshot.generation;
    if (generation > 1)
      emit(s, encoder.encode("\r\n\x1b[0m\x1b[2m── Restarted ──\x1b[0m\r\n"));
    // crew's own restart marker is not readiness output from the command.
    s.readyOutput = "";
    try {
      const issue = directoryIssue(definition.cwd);
      if (issue) throw new Error(issue);
      s.commandDone = new Promise<void>((resolve) => {
        s.finishCommand = resolve;
      });
      const proc = Bun.spawn(
        internalCommand("session", [
          process.env.SHELL || "/bin/sh",
          definition.command,
        ]),
        {
          cwd: definition.cwd,
          detached: true,
          ipc(message: unknown) {
            const value = message as { type?: string; code?: number };
            if (
              value?.type !== "command-exit" ||
              typeof value.code !== "number" ||
              s.snapshot.generation !== generation
            )
              return;
            s.finishCommand?.();
            if (s.snapshot.state === "stopping") return;
            s.snapshot = {
              ...s.snapshot,
              state: value.code === 0 ? "exited" : "error",
              exitCode: value.code,
              endedAt: Date.now(),
              error: value.code === 0 ? null : `Exited with code ${value.code}`,
            };
            changed();
          },
          env: {
            ...process.env,
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            CREW_SERVICE: definition.id,
          },
          terminal: {
            cols: s.cols,
            rows: s.rows,
            data(_term, bytes) {
              if (s.snapshot.generation === generation)
                emit(s, new Uint8Array(bytes));
            },
          },
        },
      );
      s.process = proc;
      s.group = proc.pid;
      s.snapshot = {
        ...s.snapshot,
        state: "running",
        pid: proc.pid,
        runningReady: definition.ready,
        runningDependsOn: definition.dependsOn,
        runningCommand: definition.command,
        runningCwd: definition.cwd,
      };
      changed();
      void proc.exited.then((code) => {
        s.finishCommand?.();
        if (s.snapshot.generation !== generation) return;
        // Once the anchor is gone, do not retain a reusable numeric PGID.
        s.group = undefined;
        if (
          s.snapshot.generation !== generation ||
          s.snapshot.state === "stopping"
        )
          return;
        s.snapshot = {
          ...s.snapshot,
          state: "error",
          exitCode: code,
          error: `Session ended unexpectedly (code ${code})`,
          endedAt: Date.now(),
        };
        changed();
      });
      const check = definition.ready;
      if (check) {
        const deadline = Date.now() + (check.timeoutMs ?? 30000);
        const probeSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(check.timeoutMs ?? 30000),
        ]);
        while (
          !signal.aborted &&
          !shuttingDown &&
          s.snapshot.state === "running"
        ) {
          const ready = await probeReady(
            check,
            probeSignal,
            s.readyOutput ?? "",
          );
          if (signal.aborted || shuttingDown || s.snapshot.state !== "running")
            break;
          if (ready) {
            s.readyOutput = undefined;
            s.snapshot = { ...s.snapshot, readiness: "ready" };
            changed();
            return;
          }
          if (Date.now() >= deadline) break;
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(
              finish,
              Math.min(100, Math.max(1, deadline - Date.now())),
            );
            signal.addEventListener("abort", finish, { once: true });
            if (signal.aborted) finish();
          });
        }
        if (!signal.aborted && !shuttingDown) {
          s.snapshot = {
            ...s.snapshot,
            readiness: "failed",
            error: s.snapshot.error ?? "Ready check timed out",
          };
          changed();
        }
      }
    } catch (e) {
      s.snapshot = {
        ...s.snapshot,
        state: "error",
        error: String(e),
        endedAt: Date.now(),
        pid: null,
      };
      emit(s, encoder.encode(`\r\n${String(e)}\r\n`));
      changed();
    }
  }
  function start(id: string): Promise<void> {
    const s = get(id);
    const existing = starts.get(id);
    if (existing) return existing.promise;
    s.intent++;
    const controller = new AbortController();
    const request = { controller, promise: Promise.resolve() };
    request.promise = Promise.resolve()
      .then(async () => {
        for (const dep of s.definition.dependsOn ?? []) {
          if (controller.signal.aborted || shuttingDown) return;
          s.snapshot = { ...s.snapshot, waitingFor: dep };
          changed();
          // A dependency may be shared: cancelling this request must not stop it.
          const dependency = start(dep);
          await new Promise<void>((resolve, reject) => {
            const done = () => {
              controller.signal.removeEventListener("abort", done);
              resolve();
            };
            controller.signal.addEventListener("abort", done, { once: true });
            void dependency.then(done, (error) => {
              controller.signal.removeEventListener("abort", done);
              reject(error);
            });
            if (controller.signal.aborted) done();
          });
          if (controller.signal.aborted || shuttingDown) return;
          const snapshot = get(dep).snapshot;
          if (
            snapshot.state !== "running" ||
            snapshot.readiness === "failed" ||
            snapshot.error
          ) {
            s.snapshot = {
              ...s.snapshot,
              state: "error",
              error: `Dependency ${dep} is not ready: ${snapshot.error ?? snapshot.state}`,
            };
            changed();
            return;
          }
        }
        if (!controller.signal.aborted && !shuttingDown) {
          s.snapshot = { ...s.snapshot, waitingFor: undefined };
          await serialize(s, () => startSession(s, controller.signal));
        }
      })
      .finally(() => {
        if (starts.get(id) === request) {
          s.snapshot = { ...s.snapshot, waitingFor: undefined };
          starts.delete(id);
          changed();
        }
      });
    starts.set(id, request);
    return request.promise;
  }
  updateDefinitions(definitions);
  const manager = {
    start,
    stop(id: string) {
      const s = get(id);
      s.intent++;
      starts.get(id)?.controller.abort();
      starts.delete(id);
      return serialize(s, () => stopSession(s));
    },
    async restart(id: string) {
      const s = get(id);
      const stopping = manager.stop(id);
      const intent = s.intent;
      await stopping;
      if (s.intent !== intent || shuttingDown) return;
      await start(id);
    },
    async group(
      action: "start" | "stop" | "restart",
      repo: string,
      progress?: (done: number, total: number) => void,
    ) {
      const members = [...sessions.values()].filter(
        (s) => s.definition.repo === repo,
      );
      const ordered: string[] = [];
      const seen = new Set<string>();
      const ids = new Set(members.map((s) => s.definition.id));
      function visit(id: string) {
        if (seen.has(id)) return;
        seen.add(id);
        for (const dep of get(id).definition.dependsOn ?? [])
          if (ids.has(dep)) visit(dep);
        ordered.push(id);
      }
      for (const s of members) visit(s.definition.id);
      const results: { id: string; error: string | null }[] = [];
      progress?.(0, ordered.length);
      if (action === "restart")
        for (const id of [...ordered].reverse()) await manager.stop(id);
      for (const id of action === "stop" ? [...ordered].reverse() : ordered) {
        try {
          await (action === "stop" ? manager.stop(id) : start(id));
          const snapshot = get(id).snapshot;
          results.push({
            id,
            error:
              action === "stop"
                ? null
                : (snapshot.error ??
                  (snapshot.state !== "running"
                    ? `Did not start: ${snapshot.state}`
                    : null)),
          });
        } catch (e) {
          results.push({ id, error: String(e) });
        }
        progress?.(results.length, ordered.length);
      }
      return results;
    },
    write(id: string, bytes: Uint8Array) {
      const s = get(id);
      if (s.snapshot.state === "running" && !s.process?.terminal?.closed)
        s.process?.terminal?.write(bytes);
    },
    resize(id: string, cols: number, rows: number) {
      const s = get(id);
      s.cols = Math.max(1, Math.floor(cols));
      s.rows = Math.max(1, Math.floor(rows));
      if (!s.process?.terminal?.closed)
        s.process?.terminal?.resize(s.cols, s.rows);
    },
    history(id: string) {
      return get(id).history;
    },
    isShuttingDown() {
      return shuttingDown;
    },
    getSnapshot() {
      return [...sessions.values()].map((s) => ({ ...s.snapshot }));
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onOutput(listener: (e: OutputEvent) => void) {
      outputListeners.add(listener);
      return () => {
        outputListeners.delete(listener);
      };
    },
    updateDefinitions,
    shutdown() {
      if (shutdownPromise) return shutdownPromise;
      shuttingDown = true;
      for (const request of starts.values()) request.controller.abort();
      changed();
      shutdownPromise = Promise.all(
        [...sessions.values()].map((s) => serialize(s, () => stopSession(s))),
      ).then(() => {});
      return shutdownPromise;
    },
  };
  return manager;
}
export type ProcessManager = ReturnType<typeof createProcessManager>;
