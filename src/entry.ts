#!/usr/bin/env -S bun --no-env-file
export {};
const args = process.argv.slice(2);
try {
  if (args[0] === "--crew-internal") {
    if (args[1] === "session" && args.length === 4 && args[2]) {
      const { runSession } = await import("./process/session");
      await runSession([args[2], args[3]!]);
    } else if (args[1] === "demo-server" && args.length === 3 && args[2]) {
      const { runDemoServer } = await import("./demo/server");
      await runDemoServer(args[2]);
    } else if (args[1] === "demo-interactive" && args.length === 2) {
      const { runDemoInteractive } = await import("./demo/interactive");
      await runDemoInteractive();
    } else throw new Error("Invalid internal command");
  } else {
    await import("./cli");
  }
} catch (error) {
  console.error(
    `crew: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
