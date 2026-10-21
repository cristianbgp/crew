import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { release } from "node:os";
import { createHash } from "node:crypto";
import { hostPlatform } from "./platforms";
import { version } from "../src/version";

const host = hostPlatform();
if (process.argv[2] !== host.id)
  throw new Error(
    `Native runner mismatch: expected ${process.argv[2]}, running ${host.id}`,
  );
if (process.argv.includes("--write-evidence")) {
  if (!process.env.GITHUB_SHA || !process.env.GITHUB_RUN_ID)
    throw new Error(
      "Native release evidence must be recorded by the CI job after its verification steps pass.",
    );
  const build = JSON.parse(
    await readFile(resolve("dist", host.id, "build.json"), "utf8"),
  );
  if (build.version !== version || build.platform !== host.id)
    throw new Error("Native evidence build version/platform mismatch");
  const hash = async (path: string) =>
    createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const binaryHash = await hash(resolve("dist", host.id, "crew"));
  if (binaryHash !== build.sha256)
    throw new Error("Native evidence binary checksum mismatch");
  const directory = resolve("dist/evidence");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${host.id}.json`),
    JSON.stringify(
      {
        version,
        platform: host.id,
        sourceCommit: process.env.GITHUB_SHA,
        workflowRunId: process.env.GITHUB_RUN_ID,
        os: process.platform,
        arch: process.arch,
        osRelease: release(),
        bun: Bun.version,
        checks: [
          "source",
          "standalone",
          "environment",
          "terminal-source",
          "terminal-native",
          "npm-install",
        ],
        binarySha256: binaryHash,
        rootTarballSha256: await hash(
          resolve("dist/tarballs", `cristianbgp-crew-${version}.tgz`),
        ),
        platformTarballSha256: await hash(
          resolve(
            "dist/tarballs",
            `cristianbgp-crew-${host.id}-${version}.tgz`,
          ),
        ),
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(`Verified native runner: ${host.id}`);
