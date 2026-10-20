import { test, expect } from "bun:test";
import { createProcessManager } from "./manager";
import { parseConfig } from "../config/parse";
import { quote, waitFor } from "../../tests/helpers";
import type { ServiceDefinition } from "../config/types";
const def = (id: string, command = "sleep 30"): ServiceDefinition => ({
  id,
  command,
  cwd: process.cwd(),
  repo: "app",
  autostart: false,
});

test("config validates dependency graphs and optional readiness", () => {
  const text =
    '[services.api]\ncwd="."\ncommand="sleep 30"\ndepends_on=["db"]\nready={port=3456, timeout_ms=1000}\n[services.db]\ncwd="."\ncommand="sleep 30"';
  const config = parseConfig(text, "/tmp/crew.toml");
  expect(config.services[0]!.dependsOn).toEqual(["db"]);
  expect(config.services[0]!.ready).toEqual({ port: 3456, timeoutMs: 1000 });
  expect(() =>
    parseConfig(text.replace('["db"]', '["missing"]'), "/tmp/crew.toml"),
  ).toThrow("Unknown dependency");
  expect(() =>
    parseConfig(text + '\ndepends_on=["api"]', "/tmp/crew.toml"),
  ).toThrow("cycle");
  expect(() =>
    parseConfig(text.replace("port=3456", "port=0"), "/tmp/crew.toml"),
  ).toThrow("port");
});

test("dependent starts only after log readiness, concurrent starts share dependency", async () => {
  const m = createProcessManager(
    [
      {
        ...def(
          "db",
          "sleep 0.15; printf 'RE'; sleep 0.1; printf 'ADY'; sleep 30",
        ),
        ready: { log: "READY", timeoutMs: 2000 },
      },
      { ...def("api", "printf API; sleep 30"), dependsOn: ["db"] },
      { ...def("worker"), dependsOn: ["db"] },
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    const start = Promise.all([m.start("api"), m.start("worker")]);
    await Bun.sleep(70);
    expect(m.getSnapshot().find((s) => s.id === "api")!.pid).toBeNull();
    await start;
    expect(m.getSnapshot().find((s) => s.id === "db")!.readiness).toBe("ready");
    expect(m.getSnapshot().find((s) => s.id === "db")!.generation).toBe(1);
    expect(m.getSnapshot().find((s) => s.id === "api")!.state).toBe("running");
  } finally {
    await m.shutdown();
  }
});

test("readiness timeout blocks dependents, group reports partial failure", async () => {
  const m = createProcessManager(
    [
      { ...def("db"), ready: { log: "NEVER", timeoutMs: 120 } },
      { ...def("api"), dependsOn: ["db"] },
      def("healthy"),
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    const results = await m.group("start", "app");
    expect(results.find((r) => r.id === "db")!.error).toContain(
      "Ready check timed out",
    );
    expect(m.getSnapshot().find((s) => s.id === "api")!.pid).toBeNull();
    expect(m.getSnapshot().find((s) => s.id === "healthy")!.state).toBe(
      "running",
    );
    expect(m.getSnapshot().find((s) => s.id === "db")!.readiness).toBe(
      "failed",
    );
  } finally {
    await m.shutdown();
  }
});

test("stop cancels pending readiness and prevents dependent launch", async () => {
  const m = createProcessManager(
    [
      { ...def("db"), ready: { log: "NEVER", timeoutMs: 30000 } },
      { ...def("api"), dependsOn: ["db"] },
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    const pending = m.start("api");
    await waitFor(() => m.getSnapshot()[0]!.state === "running");
    await m.stop("api");
    await m.shutdown();
    await pending;
    expect(m.getSnapshot()[1]!.generation).toBe(0);
    expect(m.getSnapshot().every((s) => s.state === "stopped")).toBe(true);
  } finally {
    await m.shutdown();
  }
});

test("port and HTTP readiness probe real local endpoints", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response("ok"),
  });
  const m = createProcessManager(
    [
      { ...def("port"), ready: { port: server.port!, timeoutMs: 1000 } },
      {
        ...def("http"),
        ready: { http: `http://127.0.0.1:${server.port}/`, timeoutMs: 1000 },
      },
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    await Promise.all([m.start("port"), m.start("http")]);
    expect(m.getSnapshot().every((s) => s.readiness === "ready")).toBe(true);
  } finally {
    await m.shutdown();
    server.stop(true);
  }
});

test("exit diagnostics record timestamps and preserve the real exit code", async () => {
  const m = createProcessManager(
    [def("bad", `${quote(process.execPath)} -e 'process.exit(9)'`)],
    { stopTimeoutMs: 40 },
  );
  try {
    await m.start("bad");
    await waitFor(() => m.getSnapshot()[0]!.state === "error");
    const s = m.getSnapshot()[0]!;
    expect(s.exitCode).toBe(9);
    expect(s.startedAt).toBeGreaterThan(0);
    expect(s.endedAt).toBeGreaterThanOrEqual(s.startedAt!);
  } finally {
    await m.shutdown();
  }
});

test("restart readiness never reuses the previous run's READY output", async () => {
  const m = createProcessManager(
    [
      {
        ...def("db", "printf Restarted; sleep 30"),
        ready: { log: "Restarted", timeoutMs: 150 },
      },
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    await m.start("db");
    expect(m.getSnapshot()[0]!.readiness).toBe("ready");
    m.updateDefinitions([
      { ...def("db"), ready: { log: "Restarted", timeoutMs: 150 } },
    ]);
    await m.restart("db");
    expect(m.getSnapshot()[0]!.readiness).toBe("failed");
  } finally {
    await m.shutdown();
  }
});

test("a Stop requested after Restart wins and leaves the service stopped", async () => {
  const m = createProcessManager([def("db")], { stopTimeoutMs: 40 });
  try {
    await m.start("db");
    const restart = m.restart("db");
    const stop = m.stop("db");
    await Promise.all([restart, stop]);
    expect(m.getSnapshot()[0]!.state).toBe("stopped");
  } finally {
    await m.shutdown();
  }
});

test("a new Start after cancelling readiness starts a fresh request", async () => {
  const m = createProcessManager(
    [{ ...def("db"), ready: { log: "NEVER", timeoutMs: 30000 } }],
    { stopTimeoutMs: 40 },
  );
  try {
    const pending = m.start("db");
    await waitFor(() => m.getSnapshot()[0]!.state === "running");
    const stopping = m.stop("db");
    m.updateDefinitions([
      {
        ...def("db", "printf READY; sleep 30"),
        ready: { log: "READY", timeoutMs: 1000 },
      },
    ]);
    const starting = m.start("db");
    await Promise.all([pending, stopping, starting]);
    expect(m.getSnapshot()[0]!.readiness).toBe("ready");
    expect(m.getSnapshot()[0]!.generation).toBe(2);
  } finally {
    await m.shutdown();
  }
});

test("shutdown during cleanup of an exited session never spawns a new generation", async () => {
  const m = createProcessManager([def("db", "exit 7")], { stopTimeoutMs: 40 });
  try {
    await m.start("db");
    await waitFor(() => m.getSnapshot()[0]!.state === "error");
    const start = m.start("db");
    await waitFor(() => m.getSnapshot()[0]!.state === "stopping");
    await m.shutdown();
    await start;
    expect(m.getSnapshot()[0]!.generation).toBe(1);
    expect(m.getSnapshot()[0]!.state).toBe("stopped");
  } finally {
    await m.shutdown();
  }
});
test("group stop succeeds while retaining the original failure diagnostics", async () => {
  const m = createProcessManager([
    { ...def("db"), cwd: "/crew/missing/directory" },
  ]);
  try {
    const result = await m.group("stop", "app");
    expect(result[0]!.error).toBeNull();
    expect(m.getSnapshot()[0]!.error).toContain("Directory is unavailable");
  } finally {
    await m.shutdown();
  }
});

test("editing readiness while running keeps the active run's original check", async () => {
  const m = createProcessManager(
    [
      {
        ...def("db", "sleep 0.15; printf READY; sleep 30"),
        ready: { log: "READY", timeoutMs: 1000 },
      },
    ],
    { stopTimeoutMs: 40 },
  );
  try {
    const starting = m.start("db");
    await waitFor(() => m.getSnapshot()[0]!.state === "running");
    m.updateDefinitions([
      { ...def("db"), ready: { log: "NEXT", timeoutMs: 100 } },
    ]);
    await starting;
    expect(m.getSnapshot()[0]!.runningReady).toEqual({
      log: "READY",
      timeoutMs: 1000,
    });
    expect(m.getSnapshot()[0]!.readiness).toBe("ready");
  } finally {
    await m.shutdown();
  }
});
