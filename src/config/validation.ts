import type { ReadyCheck, ServiceDefinition } from "./types";
export function parseReady(value: unknown, id: string): ReadyCheck | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${id}.ready: expected an inline table`);
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["port", "host", "http", "log", "timeout_ms"].includes(k),
    )
  )
    throw new Error(`${id}.ready: unknown option`);
  if (["port", "http", "log"].filter((k) => v[k] !== undefined).length !== 1)
    throw new Error(`${id}.ready: choose exactly one of port, http or log`);
  const timeoutMs = v.timeout_ms ?? 30000;
  if (
    !Number.isInteger(timeoutMs) ||
    Number(timeoutMs) < 1 ||
    Number(timeoutMs) > 300000
  )
    throw new Error(`${id}.ready.timeout_ms: expected 1–300000`);
  if (v.port !== undefined) {
    if (
      !Number.isInteger(v.port) ||
      Number(v.port) < 1 ||
      Number(v.port) > 65535
    )
      throw new Error(`${id}.ready.port: expected 1–65535`);
    if (v.host !== undefined && (typeof v.host !== "string" || !v.host.trim()))
      throw new Error(`${id}.ready.host: expected a hostname`);
    return {
      port: Number(v.port),
      ...(v.host === undefined ? {} : { host: String(v.host) }),
      timeoutMs: Number(timeoutMs),
    };
  }
  if (v.host !== undefined)
    throw new Error(`${id}.ready.host: only valid for port checks`);
  if (v.http !== undefined) {
    let url: URL;
    try {
      url = new URL(String(v.http));
    } catch {
      throw new Error(`${id}.ready.http: expected an HTTP(S) URL`);
    }
    if (
      typeof v.http !== "string" ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error(
        `${id}.ready.http: expected an HTTP(S) URL without credentials`,
      );
    return { http: v.http, timeoutMs: Number(timeoutMs) };
  }
  if (typeof v.log !== "string" || !v.log.trim() || v.log.length > 4096)
    throw new Error(
      `${id}.ready.log: expected 1–4096 characters of literal text`,
    );
  return { log: v.log, timeoutMs: Number(timeoutMs) };
}
export function validateDependencies(services: ServiceDefinition[]) {
  const map = new Map(services.map((s) => [s.id, s]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) throw new Error(`Dependency cycle involving ${id}`);
    if (visited.has(id)) return;
    const service = map.get(id);
    if (!service) throw new Error(`Unknown dependency: ${id}`);
    visiting.add(id);
    for (const dep of service.dependsOn ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const service of services) visit(service.id);
}
