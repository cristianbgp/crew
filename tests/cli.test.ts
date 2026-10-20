import { test, expect } from "bun:test";
import { resolve } from "node:path";
const cli = resolve("src/cli.tsx");
async function run(args: string[]) {
  const p = Bun.spawn([process.execPath, cli, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  return {
    code: await p.exited,
    out: await new Response(p.stdout).text(),
    err: await new Response(p.stderr).text(),
  };
}
test("help and version work without a TTY, invalid args exit nonzero", async () => {
  expect((await run(["--help"])).out).toContain("crew dev");
  expect((await run(["--version"])).out).toContain("0.1.2");
  expect((await run(["unknown"])).code).toBe(1);
});
test("dev without a TTY exits instead of waiting for input", async () => {
  const r = await run(["dev"]);
  expect(r.code).toBe(1);
  expect(r.err).toContain("interactive terminal");
});
