#!/usr/bin/env -S bun --no-env-file
export {};
const args = process.argv.slice(2);
try {
  if (args[0] === "--crew-internal") {
    if (args[1] !== "session" || args.length !== 4 || !args[2])
      throw new Error("Invalid internal command");
    const { runSession } = await import("./process/session");
    await runSession([args[2], args[3]!]);
  } else {
    await import("./cli");
  }
} catch (error) {
  console.error(
    `crew: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
