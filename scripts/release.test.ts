import { expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  appendFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { platforms } from "./platforms";
import { version } from "../src/version";
import {
  validateRelease,
  publishRelease,
  prepareDownloads,
  requiredChecks,
  type ReleasePackage,
} from "./release";

const digest = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "crew release é "));
  const rootName = `cristianbgp-crew-${version}.tgz`;
  const rootManifest = {
    name: "@cristianbgp/crew",
    version,
    bin: { crew: "bin/crew.cjs" },
    engines: { node: ">=22" },
    optionalDependencies: Object.fromEntries(
      platforms.map((p) => [p.packageName, version]),
    ),
  };
  const rootFiles: Record<string, string | Uint8Array> = {
    "package/package.json": JSON.stringify(rootManifest),
    "package/bin/crew.cjs": await readFile(
      new URL("../bin/crew.cjs", import.meta.url),
    ),
    "package/LICENSE": "MIT fixture",
    "package/README.md": "fixture",
  };
  const pack = async (files: Record<string, string | Uint8Array>) =>
    new Bun.Archive(files, { compress: "gzip" }).bytes();
  const rootTar = await pack(rootFiles);
  await writeFile(join(directory, rootName), rootTar);
  for (const p of platforms) {
    const native = Buffer.concat([
      Buffer.from(p.os === "darwin" ? "cffaedfe" : "7f454c46", "hex"),
      Buffer.from(`fixture-${p.id}`),
    ]);
    const path = join(directory, p.id);
    await mkdir(path);
    await writeFile(join(path, "crew"), native);
    const pkg = { name: p.packageName, version, os: [p.os], cpu: [p.cpu] };
    const tar = await pack({
      "package/package.json": JSON.stringify(pkg),
      "package/bin/crew": native,
      "package/LICENSE": "MIT fixture",
      "package/THIRD_PARTY_NOTICES.md": "fixture",
      "package/licenses/BUN-LICENSE.md": "MIT Bun fixture",
    });
    await writeFile(
      join(directory, `cristianbgp-crew-${p.id}-${version}.tgz`),
      tar,
    );
    await writeFile(
      join(directory, `${p.id}.json`),
      JSON.stringify({
        version,
        platform: p.id,
        sourceCommit: "a".repeat(40),
        workflowRunId: "12345",
        checks: [...requiredChecks],
        binarySha256: digest(native),
        rootTarballSha256: digest(rootTar),
        platformTarballSha256: digest(tar),
      }),
    );
  }
  return {
    directory,
    rootName,
    rootManifest,
    rootFiles,
    pack,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}
function adapter(existing = new Map<string, string>(), fail?: string) {
  const published: string[] = [];
  return {
    existing,
    published,
    inspect: async (p: ReleasePackage) => existing.get(p.name) ?? null,
    publish: async (p: ReleasePackage) => {
      published.push(p.name);
      if (p.name === fail) throw new Error("synthetic publish failure");
      existing.set(p.name, p.integrity);
    },
  };
}

test("reviewed release validation orders all four native packages before root", async () => {
  const f = await fixture();
  try {
    const plan = await validateRelease(f.directory);
    expect(plan.packages.map((p) => p.name)).toEqual([
      ...platforms.map((p) => p.packageName),
      "@cristianbgp/crew",
    ]);
    expect(plan.sourceCommit).toBe("a".repeat(40));
    expect(plan.version).toBe(version);
    expect(plan.packages.every((p) => p.integrity.startsWith("sha512-"))).toBe(
      true,
    );
  } finally {
    await f.dispose();
  }
});
test("missing targets, failed CI evidence and altered binary checksums abort validation", async () => {
  for (const kind of ["missing", "checks", "binary", "source"] as const) {
    const f = await fixture();
    try {
      const target = platforms[0]!.id;
      if (kind === "missing") await rm(join(f.directory, `${target}.json`));
      if (kind === "binary")
        await appendFile(join(f.directory, target, "crew"), "tampered");
      if (kind === "checks" || kind === "source") {
        const path = join(f.directory, `${target}.json`),
          data = JSON.parse(await readFile(path, "utf8"));
        if (kind === "checks") data.checks = [];
        else data.sourceCommit = "b".repeat(40);
        await writeFile(path, JSON.stringify(data));
      }
      await expect(validateRelease(f.directory)).rejects.toThrow();
    } finally {
      await f.dispose();
    }
  }
});
test("root install scripts and unexpected credentials files are never accepted", async () => {
  for (const kind of ["script", "file"] as const) {
    const f = await fixture();
    try {
      if (kind === "script")
        f.rootFiles["package/package.json"] = JSON.stringify({
          ...f.rootManifest,
          scripts: { postinstall: "unexpected" },
        });
      else f.rootFiles["package/.npmrc"] = "fixture-only";
      const tar = await f.pack(f.rootFiles);
      await writeFile(join(f.directory, f.rootName), tar);
      for (const p of platforms) {
        const path = join(f.directory, `${p.id}.json`),
          data = JSON.parse(await readFile(path, "utf8"));
        data.rootTarballSha256 = digest(tar);
        await writeFile(path, JSON.stringify(data));
      }
      await expect(validateRelease(f.directory)).rejects.toThrow();
    } finally {
      await f.dispose();
    }
  }
});
test("native version or target drift is rejected even when evidence hashes match", async () => {
  for (const field of ["version", "os", "cpu"] as const) {
    const f = await fixture();
    try {
      const p = platforms[0]!;
      const path = join(f.directory, `cristianbgp-crew-${p.id}-${version}.tgz`);
      const files = await new Bun.Archive(await readFile(path)).files();
      const manifest = JSON.parse(
        await files.get("package/package.json")!.text(),
      );
      manifest[field] = field === "version" ? "0.0.0" : ["wrong"];
      const entries: Record<string, Uint8Array | string> = {};
      for (const [name, file] of files)
        entries[name] = new Uint8Array(await file.arrayBuffer());
      entries["package/package.json"] = JSON.stringify(manifest);
      const tar = await f.pack(entries);
      await writeFile(path, tar);
      const evidencePath = join(f.directory, `${p.id}.json`);
      const evidence = JSON.parse(await readFile(evidencePath, "utf8"));
      evidence.platformTarballSha256 = digest(tar);
      await writeFile(evidencePath, JSON.stringify(evidence));
      await expect(validateRelease(f.directory)).rejects.toThrow();
    } finally {
      await f.dispose();
    }
  }
});
test("changed reviewed tarballs abort before publishing", async () => {
  const f = await fixture();
  try {
    const plan = await validateRelease(f.directory),
      state = adapter();
    await appendFile(plan.packages[0]!.path, "changed");
    await expect(publishRelease(plan, state)).rejects.toThrow("differs");
    expect(state.published).toEqual([]);
  } finally {
    await f.dispose();
  }
});
test("partial publication leaves root untouched and retry skips exact existing artifacts", async () => {
  const f = await fixture();
  try {
    const plan = await validateRelease(f.directory),
      state = adapter(new Map(), platforms[1]!.packageName);
    await expect(publishRelease(plan, state)).rejects.toThrow(
      "synthetic publish failure",
    );
    expect(state.published).not.toContain("@cristianbgp/crew");
    const retry = adapter(state.existing);
    await publishRelease(plan, retry);
    expect(retry.published).not.toContain(platforms[0]!.packageName);
    expect(retry.published.at(-1)).toBe("@cristianbgp/crew");
  } finally {
    await f.dispose();
  }
});
test("registry integrity conflicts abort before any publication and completed retries do nothing", async () => {
  const f = await fixture();
  try {
    const plan = await validateRelease(f.directory);
    const conflict = adapter(
      new Map([["@cristianbgp/crew", "sha512-different"]]),
    );
    await expect(publishRelease(plan, conflict)).rejects.toThrow("differs");
    expect(conflict.published).toEqual([]);
    const complete = adapter(
      new Map(plan.packages.map((p) => [p.name, p.integrity])),
    );
    await publishRelease(plan, complete);
    expect(complete.published).toEqual([]);
  } finally {
    await f.dispose();
  }
});
test("accepted but still-processing publication is waited for instead of published again", async () => {
  const f = await fixture();
  try {
    const plan = await validateRelease(f.directory),
      first = plan.packages[0]!,
      state = adapter();
    let reads = 0;
    const inspect = state.inspect;
    state.inspect = async (p) =>
      p.name === first.name
        ? ++reads > 1
          ? first.integrity
          : null
        : inspect(p);
    await publishRelease(plan, state, {
      accepted: { [`${first.name}@${first.version}`]: first.integrity },
      pause: async () => {},
      maxAttempts: 3,
    });
    expect(state.published).not.toContain(first.name);
    expect(state.published.at(-1)).toBe("@cristianbgp/crew");
  } finally {
    await f.dispose();
  }
});
test("download preparation is idempotent and never overwrites different existing files", async () => {
  const f = await fixture();
  const output = join(f.directory, "downloads");
  try {
    const plan = await validateRelease(f.directory);
    await prepareDownloads(plan, output);
    await prepareDownloads(plan, output);
    const sums = await readFile(join(output, "SHA256SUMS"), "utf8");
    expect(sums).toContain("crew-linux-x64");
    expect(sums).toContain(f.rootName);
    await writeFile(join(output, "crew-linux-x64"), "different");
    await expect(prepareDownloads(plan, output)).rejects.toThrow("differs");
  } finally {
    await f.dispose();
  }
});
