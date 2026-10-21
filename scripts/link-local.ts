import { mkdir, symlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildBinary } from "./build";
import { stagePackages } from "./package";
import { hostPlatform } from "./platforms";

const host = hostPlatform();
await buildBinary(host.id, resolve("dist"));
await stagePackages(resolve("dist"), resolve("dist/npm"), { hostOnly: true });
await mkdir(resolve("node_modules/@cristianbgp"), { recursive: true });
const link = join(resolve("node_modules"), host.packageName);
await rm(link, { recursive: true, force: true });
await symlink(resolve("dist/npm", host.id), link, "dir");
const child = Bun.spawn([process.execPath, "--no-env-file", "link"], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exitCode = await child.exited;
