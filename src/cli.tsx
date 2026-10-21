#!/usr/bin/env -S bun --no-env-file
import {
  loadWorkspaceState,
  saveWorkspaceState,
  type WorkspaceState,
} from "./state/workspace";
import { workspaceTitle } from "./terminal/title";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--config" ? ["dev", ...rawArgs] : rawArgs;
const command = args[0] ?? "dev";
const help = `crew — your services, one workspace.\n\nUsage:\n  crew                      Start services from ./crew.toml\n  crew dev                  Start services from ./crew.toml\n  crew dev --config <file>  Use another workspace file\n  crew demo                 Try the bundled demo without changing your repos\n  crew --help\n  crew --version\n\nRun locally with: bun --no-env-file src/cli.tsx dev\n`;
async function main() {
  if (command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command === "--version") {
    console.log("0.1.3");
    return;
  }
  if (!["dev", "demo"].includes(command))
    throw new Error(`Unknown command: ${command}\n${help}`);
  let path = resolve("crew.toml");
  if (command === "demo")
    path = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../examples/crew.toml",
    );
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
  const document = await loadConfig(path);
  const preferences = await loadWorkspaceState(path);
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
    throw error;
  });
  process.title = "crew";
  const updateTitle = (name: string | null) =>
    renderer.setTerminalTitle(workspaceTitle(name));
  let closing: Promise<void> | undefined;
  const quit = () => {
    if (closing) return;
    closing = manager.shutdown().finally(() => renderer.destroy());
  };
  const signal = () => quit();
  process.on("SIGINT", signal);
  process.on("SIGTERM", signal);
  try {
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
    process.off("SIGINT", signal);
    process.off("SIGTERM", signal);
  }
}
await main().catch((e) => {
  console.error(`crew: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
