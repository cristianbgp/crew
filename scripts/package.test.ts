import { expect, test } from "bun:test";
import { mkdtemp, rm, readFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stagePackages } from "./package";
import { buildBinary } from "./build";
import { hostPlatform } from "./platforms";
import { version } from "../src/version";

test("staging refuses incomplete release inputs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crew-stage-"));
  try {
    await expect(
      stagePackages(directory, join(directory, "output")),
    ).rejects.toThrow("Missing");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("host-only staging produces a small root and versioned native package", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crew-stage-"));
  try {
    const host = hostPlatform();
    await buildBinary(host.id, join(directory, "binaries"));
    await stagePackages(
      join(directory, "binaries"),
      join(directory, "output"),
      { hostOnly: true },
    );
    const root = JSON.parse(
      await readFile(join(directory, "output/root/package.json"), "utf8"),
    );
    const native = JSON.parse(
      await readFile(join(directory, `output/${host.id}/package.json`), "utf8"),
    );
    expect(root.name).toBe("@cristianbgp/crew");
    expect(root.version).toBe(version);
    expect(root.engines).toEqual({ node: ">=22" });
    expect(root.dependencies).toBeUndefined();
    expect(root.scripts).toBeUndefined();
    expect(Object.keys(root.optionalDependencies).length).toBe(4);
    expect(Object.values(root.optionalDependencies)).toEqual([
      version,
      version,
      version,
      version,
    ]);
    expect(native.name).toBe(host.packageName);
    expect(native.version).toBe(version);
    expect(native.os).toEqual([host.os]);
    expect(native.cpu).toEqual([host.cpu]);
    await appendFile(join(directory, "binaries", host.id, "crew"), "tampered");
    await expect(
      stagePackages(join(directory, "binaries"), join(directory, "output"), {
        hostOnly: true,
      }),
    ).rejects.toThrow("checksum mismatch");
    expect(
      JSON.parse(
        await readFile(join(directory, "output/root/package.json"), "utf8"),
      ).version,
    ).toBe(version);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120000);
