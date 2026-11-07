import { test, expect } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  extractUrls,
  exportLogs,
  describeService,
  describeServiceSections,
} from "./diagnostics";
test("URLs are deduplicated, normalized and limited to safe HTTP(S) destinations", () => {
  expect(
    extractUrls(
      "\x1b[32mLocal: http://0.0.0.0:3000/\x1b[0m\n(http://localhost:3000/). https://example.com/docs?q=1\nhttp://user:secret@host/ javascript:bad",
    ),
  ).toEqual(["http://localhost:3000/", "https://example.com/docs?q=1"]);
});
test("log export is private, unique, readable and includes exit diagnostics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-logs-"));
  const def = {
    id: "../../api",
    command: "exit 7",
    cwd: "/tmp",
    repo: "app",
    autostart: false,
  };
  const snapshot = {
    id: def.id,
    state: "error" as const,
    error: "Exited with code 7",
    exitCode: 7,
    pid: null,
    generation: 1,
    startedAt: 1000,
    endedAt: 2500,
  };
  try {
    const a = await exportLogs(
      def,
      snapshot,
      new TextEncoder().encode("\x1b[31mFAIL\x1b[0m\r\n"),
      dir,
    );
    const b = await exportLogs(def, snapshot, new Uint8Array(), dir);
    expect(a.startsWith(dir + "/")).toBe(true);
    expect(a).not.toBe(b);
    expect((await stat(a)).mode & 0o777).toBe(0o600);
    expect(await readFile(a, "utf8")).toContain("FAIL\n");
    expect(describeService(def, snapshot, 5000)).toContain("1.5s");
    expect(await readFile(a, "utf8")).toContain("Exit code: 7");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("diagnostic UI groups information and labels local timestamps while exports retain ISO", () => {
  const service = {
    id: "api",
    repo: "product",
    cwd: "/tmp",
    command: "bun run dev",
    autostart: false,
  };
  const startedAt = Date.parse("2026-11-07T20:30:00Z");
  const snapshot = {
    id: "api",
    state: "running" as const,
    pid: 123,
    generation: 1,
    exitCode: null,
    error: null,
    startedAt,
  };
  const sections = describeServiceSections(
    service,
    snapshot,
    startedAt + 1500,
    "America/Lima",
  );
  expect(sections.map((section) => section.title)).toEqual([
    "Overview",
    "Process · America/Lima",
    "Configuration",
    "Output",
  ]);
  const text = sections.flatMap((section) => section.lines).join("\n");
  expect(text).toContain("Service: api");
  expect(text).toContain("3:30:00 PM");
  expect(text).toContain("Duration: 1.5s");
  expect(text).not.toContain("20:30:00.000Z");
  expect(describeService(service, snapshot, startedAt + 1500)).toContain(
    "2026-11-07T20:30:00.000Z",
  );
});
