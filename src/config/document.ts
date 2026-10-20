import { parseForESLint } from "toml-eslint-parser";
import { dirname, relative } from "node:path";
import type { CrewConfig, ServiceDefinition } from "./types";
export interface ConfigDocument {
  config: CrewConfig;
  text: string;
  path: string;
  hash: string;
}
export type ConfigMutation =
  | { type: "add" | "update"; serviceId: string; service: ServiceDefinition }
  | { type: "remove"; serviceId: string };
const str = (s: string) =>
  JSON.stringify(s)
    .replace(/\\u0008/g, "\\b")
    .replace(/\\u000c/g, "\\f");
function advancedValues(service: ServiceDefinition): Record<string, string> {
  const ready = service.ready;
  return {
    ...(service.dependsOn
      ? { depends_on: JSON.stringify(service.dependsOn) }
      : {}),
    ...(ready
      ? {
          ready: `{ ${Object.entries(ready)
            .map(
              ([k, v]) =>
                `${k === "timeoutMs" ? "timeout_ms" : k} = ${typeof v === "string" ? str(v) : v}`,
            )
            .join(", ")} }`,
        }
      : {}),
  };
}
export function serializeService(
  service: ServiceDefinition,
  path: string,
  eol = "\n",
) {
  const cwd = relative(dirname(path), service.cwd) || ".";
  return (
    `[services.${str(service.id)}]${eol}repo = ${str(service.repo)}${eol}cwd = ${str(cwd)}${eol}command = ${str(service.command)}${eol}autostart = ${service.autostart}${eol}` +
    Object.entries(advancedValues(service))
      .map(([k, v]) => `${k} = ${v}${eol}`)
      .join("")
  );
}
export function serializeConfig(config: CrewConfig, path: string) {
  return (
    `name = ${str(config.name)}\n\n` +
    config.services.map((s) => serializeService(s, path)).join("\n")
  );
}
export function mutateDocument(
  doc: ConfigDocument,
  mutation: ConfigMutation,
): string {
  const text = doc.text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const ast = parseForESLint(text).ast;
  const tables = ast.body[0].body.filter(
    (n) =>
      n.type === "TOMLTable" &&
      n.resolvedKey[0] === "services" &&
      n.resolvedKey[1] === mutation.serviceId,
  );
  const table = tables.find(
    (t) => t.type === "TOMLTable" && t.resolvedKey.length === 2,
  );
  if (mutation.type === "add") {
    if (doc.config.services.some((s) => s.id === mutation.serviceId))
      throw new Error(`Service ${mutation.serviceId} already exists`);
    return (
      text +
      (text.endsWith("\n") ? "" : eol) +
      eol +
      serializeService(
        { ...mutation.service, id: mutation.serviceId },
        doc.path,
        eol,
      )
    );
  }
  if (!doc.config.services.some((s) => s.id === mutation.serviceId))
    throw new Error(`Unknown service: ${mutation.serviceId}`);
  if (
    !table ||
    table.type !== "TOMLTable" ||
    table.kind !== "standard" ||
    tables.length !== 1
  )
    throw new Error(
      "Edit this service as a [services.name] table in crew.toml first",
    );
  const edits: { start: number; end: number; value: string }[] = [];
  if (mutation.type === "remove") {
    // Remove only syntax nodes; leave comment text and unrelated sections intact.
    edits.push({
      start: table.range[0],
      end: text.indexOf("]", table.key.range[1]) + 1,
      value: "",
    });
    for (const node of table.body)
      edits.push({ start: node.range[0], end: node.range[1], value: "" });
  } else {
    const values: Record<string, string> = {
      repo: str(mutation.service.repo),
      cwd: str(relative(dirname(doc.path), mutation.service.cwd) || "."),
      command: str(mutation.service.command),
      autostart: String(mutation.service.autostart),
      ...advancedValues(mutation.service),
    };
    const missing: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      const node = table.body.find(
        (n) =>
          n.key.keys.length === 1 &&
          (n.key.keys[0]!.type === "TOMLBare"
            ? n.key.keys[0]!.name
            : n.key.keys[0]!.value) === key,
      );
      if (node)
        edits.push({
          start: node.value.range[0],
          end: node.value.range[1],
          value,
        });
      else missing.push(`${key} = ${value}`);
    }
    if (missing.length) {
      const lineEnd = text.indexOf("\n", table.range[1]);
      const at = lineEnd === -1 ? text.length : lineEnd + 1;
      edits.push({
        start: at,
        end: at,
        value:
          (at === text.length && !text.endsWith("\n") ? eol : "") +
          missing.join(eol) +
          eol,
      });
    }
  }
  let result = text;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
  return result;
}
