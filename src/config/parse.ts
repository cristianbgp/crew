import { parseReady, validateDependencies } from "./validation";
import { parseForESLint, getStaticTOMLValue } from "toml-eslint-parser";
import { dirname, basename, resolve } from "node:path";
import type { CrewConfig } from "./types";
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function string(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    // oxlint-disable-next-line no-control-regex -- Reject control characters in single-line config values.
    /[\x00-\x1f\x7f]/.test(value)
  )
    throw new Error(`${field}: expected a non-empty single-line string`);
  return value;
}
export function parseConfig(text: string, path: string): CrewConfig {
  let raw: unknown;
  try {
    raw = getStaticTOMLValue(parseForESLint(text).ast);
  } catch (e) {
    throw new Error(`TOML: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!object(raw)) throw new Error("TOML: expected a document");
  const name =
    raw.name === undefined ? basename(dirname(path)) : string(raw.name, "name");
  if (raw.services !== undefined && !object(raw.services))
    throw new Error("services: expected a table");
  const services = Object.entries(raw.services ?? {}).map(([id, value]) => {
    string(id, "service id");
    if (!object(value)) throw new Error(`${id}: expected a service table`);
    const rawCwd = string(value.cwd, `${id}.cwd`);
    const cwd = resolve(dirname(path), rawCwd);
    // Commands can be multiline shell scripts, but must not contain a NUL.
    if (
      typeof value.command !== "string" ||
      !value.command.trim() ||
      value.command.includes("\0")
    )
      throw new Error(`${id}.command: expected a non-empty command`);
    if (value.autostart !== undefined && typeof value.autostart !== "boolean")
      throw new Error(`${id}.autostart: expected true or false`);
    if (
      value.depends_on !== undefined &&
      (!Array.isArray(value.depends_on) ||
        value.depends_on.some(
          (d: unknown) => typeof d !== "string" || !d.trim(),
        ))
    )
      throw new Error(`${id}.depends_on: expected service names`);
    const ready = parseReady(value.ready, id);
    return {
      ...(value.depends_on === undefined
        ? {}
        : { dependsOn: value.depends_on as string[] }),
      ...(ready ? { ready } : {}),
      id,
      cwd,
      command: value.command,
      repo: value.repo === undefined ? name : string(value.repo, `${id}.repo`),
      autostart: value.autostart !== false,
    };
  });
  validateDependencies(services);
  return { name, services };
}
