import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  writeFile,
  rename,
  rm,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { platforms } from "./platforms";
import { version } from "../src/version";

export const requiredChecks = [
  "source",
  "standalone",
  "environment",
  "terminal-source",
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
  binaries: { target: string; path: string; sha256: string }[];
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
      ? /^package\/(package\.json|bin\/crew|LICENSE|THIRD_PARTY_NOTICES\.md|licenses\/(BUN-LICENSE\.md|LICENSE[^/]*|AUTHORS[^/]*|PATENTS[^/]*))$/
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
  const packages: ReleasePackage[] = [],
    binaries: ReleasePlan["binaries"] = [];
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
      !tar.files.has("package/THIRD_PARTY_NOTICES.md")
    )
      throw new Error(`Missing native license notices: ${p.id}`);
    binaries.push({
      target: p.id,
      path: binaryPaths[0]!,
      sha256: hash(binary),
    });
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
  return { version, sourceCommit, workflowRunId, packages, binaries };
}
export async function publishRelease(
  plan: ReleasePlan,
  adapter: Adapter,
  options: {
    accepted?: Record<string, string>;
    onAccepted?: (pkg: ReleasePackage) => Promise<void>;
    pause?: () => Promise<void>;
    maxAttempts?: number;
  } = {},
) {
  const existing = new Map<string, string | null>();
  for (const pkg of plan.packages) {
    const found = await adapter.inspect(pkg);
    if (found && found !== pkg.integrity)
      throw new Error(`Registry integrity differs: ${pkg.name}@${pkg.version}`);
    existing.set(pkg.name, found);
    const accepted = options.accepted?.[`${pkg.name}@${pkg.version}`];
    if (accepted && accepted !== pkg.integrity)
      throw new Error(`Accepted receipt differs: ${pkg.name}`);
    if (hash(await readFile(pkg.path)) !== pkg.sha256)
      throw new Error(`Reviewed tarball differs: ${pkg.path}`);
  }
  for (const pkg of plan.packages) {
    if (existing.get(pkg.name)) continue;
    if (!options.accepted?.[`${pkg.name}@${pkg.version}`]) {
      await adapter.publish(pkg);
      await options.onAccepted?.(pkg);
    }
    let found = false;
    for (let attempt = 0; attempt < (options.maxAttempts ?? 200); attempt++) {
      const integrity = await adapter.inspect(pkg);
      if (integrity === pkg.integrity) {
        found = true;
        break;
      }
      if (integrity) throw new Error(`Registry integrity differs: ${pkg.name}`);
      await (options.pause?.() ?? Bun.sleep(3000));
    }
    if (!found)
      throw new Error(
        `npm is still processing ${pkg.name}; retry using the saved receipt. Root publication remains gated.`,
      );
  }
}
export async function prepareDownloads(plan: ReleasePlan, directory: string) {
  await mkdir(directory, { recursive: true });
  const output = new Map<string, Uint8Array>();
  for (const pkg of plan.packages)
    output.set(basename(pkg.path), await readFile(pkg.path));
  for (const binary of plan.binaries)
    output.set(`crew-${binary.target}`, await readFile(binary.path));
  output.set("LICENSE", await readFile(new URL("../LICENSE", import.meta.url)));
  for (let i = 0; i < platforms.length; i++) {
    const tar = await inspectArchive(plan.packages[i]!.path, true);
    for (const [name, file] of tar.files)
      if (
        name.startsWith("package/licenses/") ||
        name === "package/THIRD_PARTY_NOTICES.md"
      )
        output.set(
          `licenses/${platforms[i]!.id}/${basename(name)}`,
          new Uint8Array(await file.arrayBuffer()),
        );
  }
  output.set(
    "RELEASE.json",
    Buffer.from(
      JSON.stringify(
        {
          version: plan.version,
          sourceCommit: plan.sourceCommit,
          workflowRunId: plan.workflowRunId,
        },
        null,
        2,
      ) + "\n",
    ),
  );
  output.set(
    "SHA256SUMS",
    Buffer.from(
      [...output].map(([name, bytes]) => `${hash(bytes)}  ${name}`).join("\n") +
        "\n",
    ),
  );
  // Check all existing files before writing any new artifact.
  for (const [name, bytes] of output) {
    try {
      if (hash(await readFile(join(directory, name))) !== hash(bytes))
        throw new Error(`Existing download differs: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  for (const [name, bytes] of output) {
    const path = join(directory, name);
    await mkdir(resolve(path, ".."), { recursive: true });
    try {
      await writeFile(path, bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (name.startsWith("crew-")) await chmod(path, 0o755);
  }
}

async function verifyGitHub(plan: ReleasePlan) {
  const api =
    "https://api.github.com/repos/cristianbgp/crew/actions/runs/" +
    plan.workflowRunId;
  const headers = { Accept: "application/vnd.github+json" };
  const runResponse = await fetch(api, { headers });
  if (!runResponse.ok)
    throw new Error(`GitHub run lookup failed: ${runResponse.status}`);
  const run = (await runResponse.json()) as {
    head_sha: string;
    conclusion: string;
    path: string;
  };
  if (
    run.head_sha !== plan.sourceCommit ||
    run.conclusion !== "success" ||
    run.path !== ".github/workflows/ci.yml"
  )
    throw new Error(
      "Release requires a successful native CI run of the reviewed commit",
    );
  const response = await fetch(api + "/jobs?per_page=100", { headers });
  if (!response.ok) throw new Error("GitHub native jobs lookup failed");
  const { jobs } = (await response.json()) as {
    jobs: { name: string; conclusion: string }[];
  };
  if (
    platforms.some(
      (p) =>
        !jobs.some(
          (job) =>
            job.name === `native (${p.id})` && job.conclusion === "success",
        ),
    )
  )
    throw new Error("All four successful native jobs are required");
}
async function main() {
  const args = process.argv.slice(2),
    directoryIndex = args.indexOf("--directory");
  const modes = ["--dry-run", "--prepare", "--publish"].filter((mode) =>
    args.includes(mode),
  );
  if (directoryIndex < 0 || !args[directoryIndex + 1] || modes.length !== 1)
    throw new Error(
      "Usage: release.ts --directory <reviewed-artifacts> (--dry-run | --prepare <output> | --publish)",
    );
  const directory = resolve(args[directoryIndex + 1]!),
    plan = await validateRelease(directory);
  console.log(
    JSON.stringify(
      {
        version: plan.version,
        sourceCommit: plan.sourceCommit,
        workflowRunId: plan.workflowRunId,
        publicationOrder: plan.packages.map((p) => ({
          name: p.name,
          integrity: p.integrity,
        })),
      },
      null,
      2,
    ),
  );
  await verifyGitHub(plan);
  if (modes[0] === "--prepare") {
    const output = args[args.indexOf("--prepare") + 1];
    if (!output || output.startsWith("--"))
      throw new Error("Missing downloads output directory");
    await prepareDownloads(plan, resolve(output));
  }
  if (modes[0] !== "--publish") return;
  const lock = join(directory, ".publishing");
  const receipt = join(directory, ".release-state.json");
  let accepted: Record<string, string> = {};
  try {
    accepted = JSON.parse(await readFile(receipt, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const run = async (args: string[], inherit = false) => {
    const child = Bun.spawn(["npm", ...args], {
      stdout: inherit ? "inherit" : "pipe",
      stderr: inherit ? "inherit" : "pipe",
    });
    const [stdout, stderr] = inherit
      ? ["", ""]
      : await Promise.all([
          new Response(child.stdout as ReadableStream).text(),
          new Response(child.stderr as ReadableStream).text(),
        ]);
    return { code: await child.exited, stdout, stderr };
  };
  await mkdir(lock); // Exclusive guard; a crashed publisher needs explicit maintainer recovery.
  try {
    await publishRelease(
      plan,
      {
        inspect: async (pkg) => {
          const result = await run([
            "view",
            `${pkg.name}@${pkg.version}`,
            "dist.integrity",
            "--json",
            "--registry=https://registry.npmjs.org/",
          ]);
          if (result.code === 0) return JSON.parse(result.stdout) as string;
          if (/E404/.test(result.stderr)) return null;
          throw new Error(`npm lookup failed: ${result.stderr}`);
        },
        publish: async (pkg) => {
          if (
            (
              await run(
                [
                  "publish",
                  pkg.path,
                  "--access",
                  "public",
                  "--tag",
                  "latest",
                  "--auth-type=web",
                  "--registry=https://registry.npmjs.org/",
                ],
                true,
              )
            ).code !== 0
          )
            throw new Error(`npm publish failed: ${pkg.name}`);
        },
      },
      {
        accepted,
        onAccepted: async (pkg) => {
          accepted[`${pkg.name}@${pkg.version}`] = pkg.integrity;
          await writeFile(
            receipt + ".tmp",
            JSON.stringify(accepted, null, 2) + "\n",
            {
              mode: 0o600,
            },
          );
          await rename(receipt + ".tmp", receipt);
        },
      },
    );
  } finally {
    await rm(lock, { recursive: true });
  }
}
if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
