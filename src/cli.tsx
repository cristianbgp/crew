#!/usr/bin/env -S bun --no-env-file
import {
  loadWorkspaceState,
  saveWorkspaceState,
  type WorkspaceState,
} from "./state/workspace";
import { workspaceTitle } from "./terminal/title";
import { resolve } from "node:path";
import { version } from "./version";
import { standalone } from "./runtime/launch";
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--config" ? ["dev", ...rawArgs] : rawArgs;
const command = args[0] ?? "dev";
const help = `crew — your services, one workspace.\n\nUsage:\n  crew                      Start services from ./crew.toml\n  crew dev                  Start services from ./crew.toml\n  crew dev --config <file>  Use another workspace file\n  crew demo                 Try the bundled demo without changing your repos\n  crew --help\n  crew --version\n${standalone ? "" : "\nRun locally with: bun --no-env-file src/entry.ts dev\n"}`;
async function main() {
  if (command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log(version);
    return;
  }
  if (!["dev", "demo"].includes(command))
    throw new Error(`Unknown command: ${command}\n${help}`);
  let path = resolve("crew.toml");
  if (args.length > 1) {
    if (
      command !== "dev" ||
      args[1] !== "--config" ||
      !args[2] ||
      args.length !== 3
    )
      throw new Error(help);
    path = resolve(args[2]);
  }
  const themePreference = process.env.CREW_THEME ?? "auto";
  if (
    themePreference !== "auto" &&
    themePreference !== "light" &&
    themePreference !== "dark"
  )
    throw new Error("CREW_THEME must be auto, light or dark");
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "crew needs an interactive terminal. Run crew dev in your terminal.",
    );
  let demo: Awaited<
    ReturnType<typeof import("./demo/workspace").createDemoWorkspace>
  > | null = null;
  let stopping = false;
  let requestQuit: (() => void) | undefined;
  const signal = () => {
    stopping = true;
    requestQuit?.();
  };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  for (const name of signals) process.on(name, signal);
  try {
    if (command === "demo")
      demo = await (await import("./demo/workspace")).createDemoWorkspace();
    if (demo) path = demo.path;
    if (stopping) return;
    // Keep help/noninteractive commands fast and avoid initializing native terminal code.
    const [
      { createCliRenderer },
      { createRoot },
      { loadConfig },
      { createProcessManager },
      { CrewRoot },
    ] = await Promise.all([
      import("@opentui/core"),
      import("@opentui/react"),
      import("./config/store"),
      import("./process/manager"),
      import("./ui/CrewRoot"),
    ]);
    if (stopping) return;
    const document = await loadConfig(path);
    const preferences = await loadWorkspaceState(path);
    if (stopping) return;
    let latestPreferences: WorkspaceState | undefined;
    let preferenceTimer: ReturnType<typeof setTimeout> | undefined;
    let preferenceWrite = Promise.resolve();
    const flushPreferences = () => {
      clearTimeout(preferenceTimer);
      const next = latestPreferences;
      latestPreferences = undefined;
      if (next)
        preferenceWrite = preferenceWrite
          .then(() => saveWorkspaceState(path, next))
          .then(
            () => {},
            () => {},
          );
      return preferenceWrite;
    };
    const rememberPreferences = (value: WorkspaceState) => {
      if (demo) return;
      latestPreferences = value;
      clearTimeout(preferenceTimer);
      preferenceTimer = setTimeout(() => {
        void flushPreferences();
      }, 250);
    };
    const manager = createProcessManager(document?.config.services ?? []);
    // Save the previous tab/window title before OpenTUI takes stdout ownership.
    process.stdout.write("\x1b[22;0t");
    const renderer = await createCliRenderer({
      exitOnCtrlC: false,
      targetFps: 30,
      useMouse: true,
      backgroundColor: "#111318",
    }).catch((error) => {
      process.stdout.write("\x1b[23;0t");
      // OpenTUI can reject initialization when its own signal handler closes
      // the native terminal transition. A requested shutdown is successful.
      if (stopping) return null;
      throw error;
    });
    if (!renderer) return;
    process.title = "crew";
    const updateTitle = (name: string | null) =>
      renderer.setTerminalTitle(workspaceTitle(name));
    let closing: Promise<void> | undefined;
    const quit = () => {
      if (closing) return;
      closing = manager.shutdown().finally(() => renderer.destroy());
    };
    requestQuit = quit;
    try {
      if (stopping) {
        quit();
        await renderer.closed;
        return;
      }
      createRoot(renderer).render(
        <CrewRoot
          onWorkspaceNameChange={updateTitle}
          theme={themePreference}
          initialPreferences={preferences}
          onPreferencesChange={rememberPreferences}
          initialDocument={document}
          path={path}
          manager={manager}
          onQuit={quit}
        />,
      );
      if (document)
        await Promise.all(
          document.config.services
            .filter((s) => s.autostart)
            .map((s) => manager.start(s.id)),
        );
      await renderer.closed;
    } finally {
      await manager.shutdown();
      await flushPreferences();
      renderer.destroy();
      await renderer.closed;
      process.stdout.write("\x1b[23;0t");
      requestQuit = undefined;
    }
  } finally {
    try {
      await demo?.dispose();
    } finally {
      for (const name of signals) process.off(name, signal);
    }
  }
}
await main().catch((e) => {
  console.error(`crew: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
