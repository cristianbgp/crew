import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { version } from "../src/version";
import { resolve, join } from "node:path";
import { hostPlatform, platforms, type PlatformId } from "./platforms";

export async function buildBinary(target: PlatformId, outputDirectory: string) {
  const platform = platforms.find((p) => p.id === target);
  if (!platform) throw new Error(`Unsupported target: ${target}`);
  try {
    import.meta.resolve(`@opentui/core-${platform.id}`);
  } catch {
    throw new Error(
      `Missing OpenTUI native dependency for ${target}. Install target dependencies with bun install --os="*" --cpu="*" before building.`,
    );
  }
  const directory = resolve(outputDirectory, target);
  await mkdir(directory, { recursive: true });
  const binary = join(directory, "crew");
  const result = await Bun.build({
    entrypoints: [resolve(import.meta.dir, "../src/entry.ts")],
    target: "bun",
    env: "disable",
    minify: true,
    define: {
      __CREW_STANDALONE__: "true",
      "process.platform": JSON.stringify(platform.os),
      "process.arch": JSON.stringify(platform.cpu),
      "process.env.OPENTUI_LIBC": JSON.stringify("glibc"),
    },
    compile: {
      target: platform.target,
      outfile: binary,
      autoloadDotenv: false,
      autoloadBunfig: false,
      autoloadPackageJson: false,
      autoloadTsconfig: false,
    },
  });
  if (!result.success)
    throw new AggregateError(result.logs, `Build failed for ${target}`);
  if (platform.os === "darwin") {
    if (process.platform !== "darwin")
      throw new Error(
        "Build macOS releases on macOS to sign and verify the executable.",
      );
    // Bun 1.4.0's build API leaves its modified Mach-O signature invalid.
    for (const args of [
      ["--force", "--sign", "-", "--timestamp=none", binary],
      ["--verify", "--strict", binary],
    ]) {
      const sign = Bun.spawn(["/usr/bin/codesign", ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const error = await new Response(sign.stderr).text();
      if ((await sign.exited) !== 0)
        throw new Error(`Cannot sign/verify ${target}: ${error}`);
    }
  }
  await writeFile(
    join(directory, "build.json"),
    JSON.stringify(
      {
        platform: target,
        version,
        sha256: createHash("sha256")
          .update(await readFile(binary))
          .digest("hex"),
      },
      null,
      2,
    ) + "\n",
  );
  return binary;
}
if (import.meta.main)
  console.log(
    await buildBinary(
      (process.argv[2] ?? hostPlatform().id) as PlatformId,
      resolve("dist"),
    ),
  );
