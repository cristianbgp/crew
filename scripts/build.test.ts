import { expect, test } from "bun:test";
import { buildBinary } from "./build";
import { platforms, hostPlatform } from "./platforms";
import {
  mkdtemp,
  rm,
  copyFile,
  chmod,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { version } from "../src/version";

test("release platform descriptors are explicit and reject unsupported hosts", () => {
  expect(platforms.map((p) => p.id)).toEqual([
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
  ]);
  expect(() => hostPlatform("win32", "x64")).toThrow("Unsupported platform");
  expect(() => hostPlatform("linux", "ia32")).toThrow("Unsupported platform");
  for (const p of platforms)
    expect(p.packageName).toBe(`@cristianbgp/crew-${p.id}`);
});

test("host binary runs outside the source tree with no runtimes on PATH and no dotenv loading", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew standalone é "));
  try {
    const built = await buildBinary(hostPlatform().id, join(dir, "build"));
    const isolated = join(dir, "isolated");
    await mkdir(isolated);
    const binary = join(isolated, "crew");
    await copyFile(built, binary);
    await chmod(binary, 0o755);
    await writeFile(join(isolated, ".env"), "CREW_THEME=invalid-from-dotenv\n");
    for (const [args, expected] of [
      [["--version"], version],
      [["--help"], "crew dev"],
      [[], "interactive terminal"],
    ] as [string[], string][]) {
      const p = Bun.spawn([binary, ...args], {
        cwd: isolated,
        env: { ...process.env, PATH: isolated, CREW_THEME: undefined },
        stdout: "pipe",
        stderr: "pipe",
      });
      const out = await new Response(p.stdout).text(),
        err = await new Response(p.stderr).text();
      expect(await p.exited).toBe(args.length ? 0 : 1);
      expect(out + err).toContain(expected);
      expect(err).not.toContain("CREW_THEME must");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
