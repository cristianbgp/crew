import { acquireConfigLock } from "./lock";
import { readFile, open, rename, unlink, stat, link } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { CrewConfig } from "./types";
import { parseConfig } from "./parse";
import {
  mutateDocument,
  serializeConfig,
  type ConfigDocument,
  type ConfigMutation,
} from "./document";
export type { ConfigDocument, ConfigMutation } from "./document";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export async function loadConfig(path: string): Promise<ConfigDocument | null> {
  path = resolve(path);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  return { config: parseConfig(text, path), text, path, hash: hash(text) };
}
export async function createConfig(
  path: string,
  config: CrewConfig,
): Promise<ConfigDocument> {
  path = resolve(path);
  const text = serializeConfig(config, path);
  parseConfig(text, path);
  const temp = path + `.${randomUUID()}.tmp`;
  const fd = await open(temp, "wx", 0o644);
  try {
    try {
      await fd.writeFile(text);
      await fd.sync();
    } finally {
      await fd.close();
    }
    // An exclusive hard-link publishes only a complete document, without
    // overwriting a configuration created by someone else during setup.
    await link(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
  return { config: parseConfig(text, path), text, path, hash: hash(text) };
}
export async function saveConfig(
  doc: ConfigDocument,
  mutation: ConfigMutation,
): Promise<ConfigDocument> {
  const path = doc.path;
  const releaseLock = await acquireConfigLock(path);
  const temp = path + `.${randomUUID()}.tmp`;
  try {
    const current = await readFile(path, "utf8");
    if (hash(current) !== doc.hash)
      throw new Error("crew.toml changed outside crew. Reload before saving.");
    const info = await stat(path);
    if (!(info.mode & 0o222)) throw new Error("crew.toml is read-only");
    const text = mutateDocument(doc, mutation);
    const config = parseConfig(text, path);
    const fd = await open(temp, "wx", info.mode & 0o777);
    try {
      await fd.writeFile(text);
      await fd.sync();
    } finally {
      await fd.close();
    }
    if (hash(await readFile(path, "utf8")) !== doc.hash)
      throw new Error("crew.toml changed outside crew. Reload before saving.");
    await rename(temp, path);
    return { config, text, path, hash: hash(text) };
  } finally {
    await releaseLock();
    await unlink(temp).catch(() => {});
  }
}
