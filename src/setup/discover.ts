import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const shellQuote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
export async function discoverScripts(
  directory: string,
): Promise<{ name: string; command: string }[]> {
  let text: string;
  try {
    text = await readFile(join(directory, "package.json"), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(text);
  } catch {
    throw new Error(
      "Cannot read package.json: invalid JSON. You can enter a command manually.",
    );
  }
  const scripts = (pkg as { scripts?: Record<string, unknown> })?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts))
    return [];
  return Object.entries(scripts)
    .filter(([, v]) => typeof v === "string")
    .map(([name]) => ({ name, command: `bun run ${shellQuote(name)}` }));
}
