import { expect, test } from "bun:test";
import { internalCommand } from "./launch";
import { fileURLToPath } from "node:url";

test("source supervisor commands preserve argument boundaries and disable dotenv", () => {
  const args = ["/a path/sh", "printf 'héllo world'"];
  expect(internalCommand("session", args)).toEqual([
    process.execPath,
    "--no-env-file",
    fileURLToPath(new URL("../entry.ts", import.meta.url)),
    "--crew-internal",
    "session",
    ...args,
  ]);
});

test("importing the supervisor does not start a keepalive or child process", async () => {
  const path = fileURLToPath(new URL("../process/session.ts", import.meta.url));
  const p = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "-e",
      `await import(${JSON.stringify(path)}); console.log('inert')`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const timer = setTimeout(() => p.kill(), 1500);
  try {
    expect(await p.exited).toBe(0);
    expect(await new Response(p.stdout).text()).toBe("inert\n");
  } finally {
    clearTimeout(timer);
  }
});
