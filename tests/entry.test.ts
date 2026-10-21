import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { version } from "../package.json";

async function run(args: string[]) {
  const p = Bun.spawn(
    [process.execPath, "--no-env-file", resolve("src/entry.ts"), ...args],
    { stdout: "pipe", stderr: "pipe" },
  );
  return {
    code: await p.exited,
    out: await new Response(p.stdout).text(),
    err: await new Response(p.stderr).text(),
  };
}
test("source entry reports the package version and public help", async () => {
  expect((await run(["--version"])).out.trim()).toBe(version);
  expect((await run(["--help"])).out).toContain("crew dev");
});
test("internal entry rejects unknown modes and malformed sessions without opening the UI", async () => {
  for (const args of [
    ["--crew-internal"],
    ["--crew-internal", "unknown"],
    ["--crew-internal", "session"],
    ["--crew-internal", "session", "/bin/sh"],
  ]) {
    const result = await run(args);
    expect(result.code).toBe(1);
    expect(result.err).toContain("Invalid internal command");
    expect(result.err).not.toContain("interactive terminal");
  }
});
