import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { selectPlatform } from "../bin/crew.cjs";
import { fileURLToPath } from "node:url";
import { version } from "../package.json";

test("npm launcher selects only supported native hosts", () => {
  for (const platform of ["darwin", "linux"])
    for (const arch of ["arm64", "x64"]) {
      expect(selectPlatform({ platform, arch, libc: "glibc" })).toBe(
        `@cristianbgp/crew-${platform}-${arch}`,
      );
    }
  for (const host of [
    { platform: "win32", arch: "x64" },
    { platform: "darwin", arch: "ia32" },
    { platform: "linux", arch: "x64", libc: "musl" },
  ])
    expect(() => selectPlatform(host)).toThrow("Unsupported");
});
test("npm launcher reports missing or mismatched optional packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "crew launcher é "));
  const name = `@cristianbgp/crew-${process.platform}-${process.arch}`;
  const resolveError = async () => {
    const launcher = fileURLToPath(new URL("../bin/crew.cjs", import.meta.url));
    const child = Bun.spawn(
      [
        "node",
        "-e",
        `try { require(process.argv[1]).resolveBinary(process.argv[2],process.argv[3]); } catch(e) { console.error(e.message); process.exitCode=1; }`,
        launcher,
        name,
        root,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const error = await new Response(child.stderr).text();
    expect(await child.exited).toBe(1);
    return error;
  };
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ version }));
    expect(await resolveError()).toContain("optional dependencies");
    const pkg = join(root, "node_modules", name);
    await mkdir(pkg, { recursive: true });
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({ name, version: "0.0.0" }),
    );
    expect(await resolveError()).toContain("version mismatch");
    await writeFile(
      join(pkg, "package.json"),
      JSON.stringify({ name, version }),
    );
    expect(await resolveError()).toContain("unexecutable binary");
    await mkdir(join(pkg, "bin"));
    await writeFile(join(pkg, "bin/crew"), "this is not a native executable\n");
    await chmod(join(pkg, "bin/crew"), 0o755);
    expect(await resolveError()).toContain("Invalid native executable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
