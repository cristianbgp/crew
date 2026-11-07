import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hostPlatform, platforms } from "../scripts/platforms";
import { version } from "../src/version";

test("npm acceptance rejects missing or mismatched prepared archives without rebuilding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crew-npm-artifacts-"));
  const host = hostPlatform();
  const rootPath = join(directory, `cristianbgp-crew-${version}.tgz`);
  const hostPath = join(
    directory,
    `cristianbgp-crew-${host.id}-${version}.tgz`,
  );
  const root = {
    name: "@cristianbgp/crew",
    version,
    optionalDependencies: Object.fromEntries(
      platforms.map((p) => [p.packageName, version]),
    ),
  };
  const native = {
    name: host.packageName,
    version,
    os: [host.os],
    cpu: [host.cpu],
  };
  const pack = (manifest: unknown) =>
    new Bun.Archive(
      {
        "package/package.json": JSON.stringify(manifest),
        "package/bin/crew": "fixture; invalid metadata must prevent execution",
      },
      { compress: "gzip" },
    ).bytes();
  try {
    const cases = [
      null,
      { root: { ...root, version: "0.0.0-stale" }, native },
      { root: { ...root, name: "unexpected-package" }, native },
      { root: { ...root, optionalDependencies: {} }, native },
      { root, native: { ...native, cpu: ["unsupported"] } },
      { root, native: { ...native, version: "0.0.0-stale" } },
    ];
    for (const fixture of cases) {
      if (fixture) {
        await writeFile(rootPath, await pack(fixture.root));
        await writeFile(hostPath, await pack(fixture.native));
      }
      const before = fixture
        ? await Promise.all([readFile(rootPath), readFile(hostPath)])
        : [];
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-env-file",
          join(import.meta.dir, "npm-install.ts"),
          "--tarballs",
          directory,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(1);
      expect(out + err).toContain("Prepared npm");
      if (fixture) {
        expect(await readFile(rootPath)).toEqual(before[0]!);
        expect(await readFile(hostPath)).toEqual(before[1]!);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120000);
