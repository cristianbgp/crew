import { stripVTControlCharacters } from "node:util";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stateDirectory } from "../state/workspace";
import type { ServiceDefinition } from "../config/types";
import type { ServiceSnapshot } from "./types";
export function plainOutput(bytes: Uint8Array | string) {
  return stripVTControlCharacters(
    typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes),
  ).replace(/\r\n?/g, "\n");
}
export function extractUrls(output: string): string[] {
  const urls = new Set<string>();
  for (const match of plainOutput(output).matchAll(/https?:\/\/[^\s<>"']+/g)) {
    try {
      const url = new URL(match[0].replace(/[).,;!]+$/, ""));
      if (url.username || url.password || !url.hostname) continue;
      if (["0.0.0.0", "[::]"].includes(url.hostname))
        url.hostname = "localhost";
      urls.add(url.href);
      if (urls.size >= 12) break;
    } catch {}
  }
  return [...urls];
}
export async function openUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Only HTTP(S) URLs without credentials can be opened");
  const args =
    process.platform === "darwin"
      ? ["/usr/bin/open", url.href]
      : ["xdg-open", url.href];
  const child = Bun.spawn(args, { stdout: "ignore", stderr: "pipe" });
  const error = await new Response(child.stderr).text();
  if ((await child.exited) !== 0)
    throw new Error(error.trim() || "Could not open the browser");
}
export function describeService(
  service: ServiceDefinition,
  s: ServiceSnapshot | undefined,
  now = Date.now(),
) {
  const duration = s?.startedAt
    ? `${(Math.max(0, (s.endedAt ?? now) - s.startedAt) / 1000).toFixed(1)}s`
    : "—";
  return [
    `Service: ${service.id}`,
    `Group: ${service.repo}`,
    `State: ${s?.state ?? "stopped"}`,
    `Readiness: ${s?.readiness ?? "not configured"}`,
    `Waiting for: ${s?.waitingFor ?? "none"}`,
    `PID: ${s?.pid ?? "—"}`,
    `Started: ${s?.startedAt ? new Date(s.startedAt).toISOString() : "—"}`,
    `Ended: ${s?.endedAt ? new Date(s.endedAt).toISOString() : "—"}`,
    `Duration: ${duration}`,
    `Exit code: ${s?.exitCode ?? "—"}`,
    `Failure: ${s?.error ?? "none"}`,
    `Dependencies: ${service.dependsOn?.join(", ") || "none"}`,
    `Command: ${s?.runningCommand ?? service.command}`,
    `Directory: ${s?.runningCwd ?? service.cwd}`,
    "Output: retained tail only, up to 1 MiB; earlier output may be unavailable.",
  ].join("\n");
}
export async function exportLogs(
  service: ServiceDefinition,
  snapshot: ServiceSnapshot | undefined,
  bytes: Uint8Array,
  directory = join(stateDirectory(), "logs"),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name =
    service.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "service";
  const path = join(directory, `${name}-${Date.now()}-${randomUUID()}.log`);
  await writeFile(
    path,
    describeService(service, snapshot) +
      "\n\n--- Retained output ---\n" +
      plainOutput(bytes),
    { mode: 0o600, flag: "wx" },
  );
  return path;
}
