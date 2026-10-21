import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { platforms } from "./platforms";
import { version } from "../src/version";

export const requiredChecks = [
  "standalone",
  "environment",
  "terminal-native",
  "npm-install",
];
const hash = (bytes: Uint8Array | string, algorithm = "sha256") =>
  createHash(algorithm)
    .update(bytes)
    .digest(algorithm === "sha512" ? "base64" : "hex");
export interface ReleasePackage {
  name: string;
  version: string;
  path: string;
  integrity: string;
  sha256: string;
}
interface ReleasePlan {
  version: string;
  sourceCommit: string;
  workflowRunId: string;
  packages: ReleasePackage[];
}
interface Adapter {
  inspect: (pkg: ReleasePackage) => Promise<string | null>;
  publish: (pkg: ReleasePackage) => Promise<void>;
}

async function inventory(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlink in reviewed artifacts: ${path}`);
    if (entry.isDirectory()) files.push(...(await inventory(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
async function unique(files: string[], name: string) {
  const matches = files.filter((file) => basename(file) === name);
  if (!matches.length) throw new Error(`Missing reviewed artifact: ${name}`);
  const first = matches[0]!;
  const digest = hash(await readFile(first));
  for (const file of matches.slice(1))
    if (hash(await readFile(file)) !== digest)
      throw new Error(`Duplicate artifact differs: ${name}`);
  return first;
}
async function inspectArchive(path: string, native: boolean) {
  const files = await new Bun.Archive(await readFile(path)).files();
  for (const name of files.keys()) {
    const allowed = native
      ? /^package\/(package\.json|bin\/crew|LICENSE|THIRD_PARTY_NOTICES\.md|licenses\/(JS-THIRD-PARTY-NOTICES\.md|BUN-LICENSE\.md|LICENSE[^/]*|AUTHORS[^/]*|PATENTS[^/]*))$/
      : /^package\/(package\.json|bin\/crew\.cjs|LICENSE|README\.md|CONTRIBUTING\.md|docs\/(configuration\.md|distribution\.md|verification\.md|images\/screenshot\.png))$/;
    if (!allowed.test(name) || name.includes(".."))
      throw new Error(`Unexpected package file: ${name}`);
  }
  const manifest = files.get("package/package.json");
  if (!manifest || !files.has("package/LICENSE"))
    throw new Error("Missing package manifest/license");
  const pkg = JSON.parse(await manifest.text());
  if (pkg.scripts || pkg.dependencies || pkg.devDependencies)
    throw new Error(
      "Release packages must not run scripts or install runtime dependencies",
    );
  if (pkg.version !== version) throw new Error("Release version drift");
  return { files, pkg };
}
export async function validateRelease(directory: string): Promise<ReleasePlan> {
  const files = await inventory(resolve(directory));
  const rootPath = await unique(files, `cristianbgp-crew-${version}.tgz`);
  const rootBytes = await readFile(rootPath);
  const root = await inspectArchive(rootPath, false);
  if (
    root.pkg.name !== "@cristianbgp/crew" ||
    root.pkg.bin?.crew !== "bin/crew.cjs" ||
    root.pkg.engines?.node !== ">=22"
  )
    throw new Error("Root package metadata mismatch");
  const expected = Object.fromEntries(
    platforms.map((p) => [p.packageName, version]),
  );
  if (
    Object.keys(root.pkg.optionalDependencies ?? {}).length !==
      platforms.length ||
    Object.entries(expected).some(
      ([name, v]) => root.pkg.optionalDependencies?.[name] !== v,
    )
  )
    throw new Error("Root platform versions mismatch");
  const launcher = root.files.get("package/bin/crew.cjs");
  if (
    !launcher ||
    hash(new Uint8Array(await launcher.arrayBuffer())) !==
      hash(await readFile(new URL("../bin/crew.cjs", import.meta.url)))
  )
    throw new Error("Root launcher differs from reviewed source");
  const packages: ReleasePackage[] = [];
  let sourceCommit = "",
    workflowRunId = "";
  for (const p of platforms) {
    const evidence = JSON.parse(
      await readFile(await unique(files, `${p.id}.json`), "utf8"),
    );
    if (
      evidence.platform !== p.id ||
      evidence.version !== version ||
      !/^[a-f0-9]{40}$/.test(evidence.sourceCommit) ||
      !/^\d+$/.test(evidence.workflowRunId) ||
      requiredChecks.some((check) => !evidence.checks?.includes(check))
    )
      throw new Error(`Incomplete native CI evidence: ${p.id}`);
    if (
      sourceCommit &&
      (sourceCommit !== evidence.sourceCommit ||
        workflowRunId !== evidence.workflowRunId)
    )
      throw new Error("Mixed native CI source commits/runs");
    sourceCommit = evidence.sourceCommit;
    workflowRunId = evidence.workflowRunId;
    const path = await unique(files, `cristianbgp-crew-${p.id}-${version}.tgz`);
    const bytes = await readFile(path),
      tar = await inspectArchive(path, true);
    if (
      tar.pkg.name !== p.packageName ||
      JSON.stringify(tar.pkg.os) !== JSON.stringify([p.os]) ||
      JSON.stringify(tar.pkg.cpu) !== JSON.stringify([p.cpu]) ||
      tar.pkg.optionalDependencies
    )
      throw new Error(`Native package metadata mismatch: ${p.id}`);
    const binaryPaths = files.filter((file) => file.endsWith(`/${p.id}/crew`));
    if (binaryPaths.length !== 1)
      throw new Error(`Missing/duplicate binary: ${p.id}`);
    const binary = await readFile(binaryPaths[0]!);
    const payload = tar.files.get("package/bin/crew");
    const magic = p.os === "darwin" ? "cffaedfe" : "7f454c46";
    if (
      !payload ||
      binary.subarray(0, 4).toString("hex") !== magic ||
      hash(binary) !== evidence.binarySha256 ||
      hash(new Uint8Array(await payload.arrayBuffer())) !==
        evidence.binarySha256 ||
      hash(bytes) !== evidence.platformTarballSha256 ||
      hash(rootBytes) !== evidence.rootTarballSha256
    )
      throw new Error(`Artifact checksum mismatch: ${p.id}`);
    if (
      !tar.files.has("package/licenses/BUN-LICENSE.md") ||
      !tar.files.has("package/licenses/JS-THIRD-PARTY-NOTICES.md") ||
      !tar.files.has("package/THIRD_PARTY_NOTICES.md")
    )
      throw new Error(`Missing native license notices: ${p.id}`);
    packages.push({
      name: p.packageName,
      version,
      path,
      sha256: hash(bytes),
      integrity: `sha512-${hash(bytes, "sha512")}`,
    });
  }
  packages.push({
    name: "@cristianbgp/crew",
    version,
    path: rootPath,
    sha256: hash(rootBytes),
    integrity: `sha512-${hash(rootBytes, "sha512")}`,
  });
  return { version, sourceCommit, workflowRunId, packages };
}
export async function publishRelease(plan: ReleasePlan, adapter: Adapter) {
  const existing = new Map<string, string | null>();
  for (const pkg of plan.packages) {
    const integrity = await adapter.inspect(pkg);
    if (integrity && integrity !== pkg.integrity)
      throw new Error(`Registry integrity differs: ${pkg.name}@${pkg.version}`);
    if (hash(await readFile(pkg.path)) !== pkg.sha256)
      throw new Error(`Reviewed tarball differs: ${pkg.path}`);
    existing.set(pkg.name, integrity);
  }
  for (const pkg of plan.packages) {
    if (existing.get(pkg.name)) continue;
    await adapter.publish(pkg);
    const integrity = await adapter.inspect(pkg);
    if (!integrity)
      throw new Error(
        `npm is still processing ${pkg.name}@${pkg.version}. Wait for registry visibility, then rerun with the same artifacts. Root publication remains gated.`,
      );
    if (integrity !== pkg.integrity)
      throw new Error(`Registry integrity differs: ${pkg.name}@${pkg.version}`);
  }
}

export async function runNpm(args: string[], inherit = false) {
  const child = Bun.spawn(
    ["npm", ...args, "--registry=https://registry.npmjs.org/"],
    {
      stdin: inherit ? "inherit" : "ignore",
      stdout: inherit ? "inherit" : "pipe",
      stderr: inherit ? "inherit" : "pipe",
    },
  );
  const [stdout, stderr] = inherit
    ? ["", ""]
    : await Promise.all([
        new Response(child.stdout as ReadableStream).text(),
        new Response(child.stderr as ReadableStream).text(),
      ]);
  return { code: await child.exited, stdout, stderr };
}
async function main() {
  const [flag, directory, mode, ...extra] = process.argv.slice(2);
  if (
    flag !== "--directory" ||
    !directory ||
    !["--dry-run", "--publish"].includes(mode ?? "") ||
    extra.length
  )
    throw new Error(
      "Usage: release.ts --directory <full-release-artifacts> (--dry-run | --publish)",
    );
  const plan = await validateRelease(directory);
  console.log(
    JSON.stringify(
      {
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        workflowRunId: plan.workflowRunId,
        publicationOrder: plan.packages.map(({ name, integrity }) => ({
          name,
          integrity,
        })),
      },
      null,
      2,
    ),
  );
  if (mode !== "--publish") return;
  await publishRelease(plan, {
    inspect: async (pkg) => {
      const result = await runNpm([
        "view",
        `${pkg.name}@${pkg.version}`,
        "dist.integrity",
        "--json",
      ]);
      if (result.code === 0) return JSON.parse(result.stdout) as string;
      if (/E404/.test(result.stderr)) return null;
      throw new Error(`npm lookup failed: ${result.stderr}`);
    },
    publish: async (pkg) => {
      const result = await runNpm(
        [
          "publish",
          pkg.path,
          "--access",
          "public",
          "--tag",
          "latest",
          "--auth-type=web",
        ],
        true,
      );
      if (result.code !== 0) throw new Error(`npm publish failed: ${pkg.name}`);
    },
  });
}
if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
