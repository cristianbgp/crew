import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
  utimes,
  rm,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import manifest from "../package.json";
import { platforms, hostPlatform } from "./platforms";

const source = resolve(import.meta.dir, "..");
const epoch = new Date("1985-10-26T08:15:00Z");
export async function stagePackages(
  inputDirectory: string,
  outputDirectory: string,
  options: { hostOnly?: boolean } = {},
) {
  const targets = options.hostOnly ? [hostPlatform()] : platforms;
  const builds = [];
  for (const target of targets) {
    const binary = join(inputDirectory, target.id, "crew");
    let record;
    try {
      record = JSON.parse(
        await readFile(join(inputDirectory, target.id, "build.json"), "utf8"),
      );
    } catch {
      throw new Error(
        `Missing build metadata for ${target.id}. Build all required targets before staging.`,
      );
    }
    const digest = createHash("sha256")
      .update(await readFile(binary))
      .digest("hex");
    const noticesPath = join(
      inputDirectory,
      target.id,
      "JS-THIRD-PARTY-NOTICES.md",
    );
    const noticesHash = createHash("sha256")
      .update(await readFile(noticesPath))
      .digest("hex");
    if (
      record.platform !== target.id ||
      record.version !== manifest.version ||
      record.noticesSha256 !== noticesHash ||
      record.sha256 !== digest
    )
      throw new Error(
        `Build metadata/version/checksum mismatch for ${target.id}`,
      );
    builds.push({ target, binary, noticesPath, sha256: digest });
  }
  await rm(outputDirectory, { recursive: true, force: true });
  const root = join(outputDirectory, "root");
  await mkdir(join(root, "bin"), { recursive: true });
  const rootManifest = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    repository: manifest.repository,
    homepage: manifest.homepage,
    bugs: manifest.bugs,
    keywords: manifest.keywords,
    bin: { crew: "bin/crew.cjs" },
    engines: { node: ">=22" },
    optionalDependencies: Object.fromEntries(
      platforms.map((p) => [p.packageName, manifest.version]),
    ),
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    files: ["bin/crew.cjs", "README.md", "CONTRIBUTING.md", "LICENSE", "docs"],
  };
  await writeFile(
    join(root, "package.json"),
    JSON.stringify(rootManifest, null, 2) + "\n",
  );
  for (const file of [
    "bin/crew.cjs",
    "LICENSE",
    "README.md",
    "CONTRIBUTING.md",
    "docs/configuration.md",
    "docs/distribution.md",
    "docs/verification.md",
    "docs/images/screenshot.png",
  ]) {
    const destination = join(root, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(source, file), destination);
  }
  await chmod(join(root, "bin/crew.cjs"), 0o755);
  for (const { target, binary, noticesPath } of builds) {
    const directory = join(outputDirectory, target.id);
    await mkdir(join(directory, "bin"), { recursive: true });
    await copyFile(binary, join(directory, "bin/crew"));
    await chmod(join(directory, "bin/crew"), 0o755);
    await copyFile(join(source, "LICENSE"), join(directory, "LICENSE"));
    const nativeDirectory = dirname(
      fileURLToPath(import.meta.resolve(`@opentui/core-${target.id}`)),
    );
    const notices = join(directory, "licenses");
    await mkdir(notices);
    await copyFile(noticesPath, join(notices, "JS-THIRD-PARTY-NOTICES.md"));
    await copyFile(
      join(source, "licenses/BUN-LICENSE.md"),
      join(notices, "BUN-LICENSE.md"),
    );
    for (const file of await readdir(nativeDirectory))
      if (/^(LICENSE|AUTHORS|PATENTS)/.test(file))
        await copyFile(join(nativeDirectory, file), join(notices, file));
    await writeFile(
      join(directory, "THIRD_PARTY_NOTICES.md"),
      "crew includes the Bun runtime (MIT, https://github.com/oven-sh/bun/blob/main/LICENSE.md), OpenTUI (MIT, https://github.com/anomalyco/opentui), and native libraries whose licenses are included in licenses/.\n",
    );
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify(
        {
          name: target.packageName,
          version: manifest.version,
          description: `crew standalone executable for ${target.id}`,
          license: manifest.license,
          repository: manifest.repository,
          os: [target.os],
          cpu: [target.cpu],
          files: ["bin/crew", "LICENSE", "licenses", "THIRD_PARTY_NOTICES.md"],
          publishConfig: {
            access: "public",
            registry: "https://registry.npmjs.org/",
          },
        },
        null,
        2,
      ) + "\n",
    );
  }
  await writeFile(
    join(outputDirectory, "binaries.json"),
    JSON.stringify(
      {
        version: manifest.version,
        binaries: builds.map(({ target, sha256 }) => ({
          platform: target.id,
          sha256,
        })),
      },
      null,
      2,
    ) + "\n",
  );
  await normalizeTimes(outputDirectory);
}
async function normalizeTimes(directory: string): Promise<void> {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await normalizeTimes(path);
    await utimes(path, epoch, epoch);
  }
  await utimes(directory, epoch, epoch);
}
export async function packDirectory(
  directory: string,
  destination: string,
): Promise<string> {
  await mkdir(destination, { recursive: true });
  const pkg = JSON.parse(
    await readFile(join(directory, "package.json"), "utf8"),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "pm",
      "pack",
      "--destination",
      resolve(destination),
    ],
    { cwd: resolve(directory), stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(child.stdout).text(),
    err = await new Response(child.stderr).text();
  if ((await child.exited) !== 0)
    throw new Error(`Cannot pack ${pkg.name}: ${out}\n${err}`);
  return join(
    resolve(destination),
    `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`,
  );
}
if (import.meta.main) {
  const hostOnly = process.argv.includes("--host-only");
  await stagePackages(resolve("dist"), resolve("dist/npm"), { hostOnly });
  for (const id of [
    "root",
    ...(hostOnly ? [hostPlatform().id] : platforms.map((p) => p.id)),
  ])
    console.log(
      await packDirectory(resolve("dist/npm", id), resolve("dist/tarballs")),
    );
}
