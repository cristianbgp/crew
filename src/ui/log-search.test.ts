import { theme } from "./theme";
import { expect, test } from "bun:test";
import { findLogMatches, formatLogOutput } from "./log-search";

test("log search finds every literal case-insensitive occurrence with original offsets", () => {
  expect(
    findLogMatches(["Alpha alpha", "context", "a.b A.B", "界 ALPHA"], "alpha"),
  ).toEqual([
    { line: 0, start: 0, end: 5 },
    { line: 0, start: 6, end: 11 },
    { line: 3, start: 2, end: 7 },
  ]);
  expect(findLogMatches(["a.b axb A.B"], "a.b")).toEqual([
    { line: 0, start: 0, end: 3 },
    { line: 0, start: 8, end: 11 },
  ]);
  expect(findLogMatches(["anything"], "")).toEqual([]);
  expect(findLogMatches(["anything"], "missing")).toEqual([]);
});

test("dense matches retain output with bounded style runs instead of a chunk per character", () => {
  const lines = Array.from({ length: 1000 }, () => "a".repeat(1000));
  const matches = findLogMatches(lines, "a");
  const output = formatLogOutput(lines, matches, 1, theme);
  expect(matches).toHaveLength(1_000_000);
  expect(output.text.chunks.length).toBeLessThan(5000);
  expect(
    output.text.chunks.filter(
      (chunk) => chunk.bg === output.text.chunks[2]?.bg && chunk.text === "a",
    ),
  ).toHaveLength(1);
  expect(output.text.chunks.map((chunk) => chunk.text).join("")).toBe(
    lines.map((line, i) => `${i + 1}  ${line}`).join("\n"),
  );
});

test("matching output groups nearby context and retains source line numbers", () => {
  const lines = [
    "noise",
    "before",
    "ERROR first",
    "after",
    "noise 4",
    "noise 5",
    "before 2",
    "ERROR second",
    "after 2",
  ];
  const matches = findLogMatches(lines, "error");
  const output = formatLogOutput(lines, matches, 1, theme, {
    onlyMatches: true,
    columns: 40,
  });
  const text = output.text.chunks.map((chunk) => chunk.text).join("");
  expect(text).toContain("2  before");
  expect(text).toContain("3  ERROR first");
  expect(text).toContain("8  ERROR second");
  expect(text).not.toContain("noise");
  expect(output.rows).toEqual([1, 2, 3, -1, 6, 7, 8]);
});

test("result snippets retain source numbers and reveal active matches after wide Unicode", () => {
  const lines = ["start TOKEN", `${"界".repeat(50)} token target end`];
  const matches = findLogMatches(lines, "token");
  const output = formatLogOutput(lines, matches, 1, theme, {
    onlyMatches: true,
    columns: 36,
  });
  const text = output.text.chunks.map((chunk) => chunk.text).join("");
  expect(text).toContain("2  …");
  expect(text).toContain("token target end");
  expect(output.columns).toBeLessThanOrEqual(36);
  expect(text).not.toContain("界".repeat(50));
});

test("search context can include a complete stack trace or only the matching lines", () => {
  const lines = [
    "request started",
    "connecting",
    "ERROR database timeout",
    "  at connect (db.ts:12)",
    "  at handler (api.ts:8)",
    '{"requestId":"r1","retry":true}',
    "request ended",
  ];
  const matches = findLogMatches(lines, "ERROR");
  const exact = formatLogOutput(lines, matches, 0, theme, {
    onlyMatches: true,
    columns: 80,
    contextLines: 0,
  });
  expect(exact.rows).toEqual([2]);
  const context = formatLogOutput(lines, matches, 0, theme, {
    onlyMatches: true,
    columns: 80,
    contextLines: 3,
  });
  expect(context.rows).toEqual([0, 1, 2, 3, 4, 5]);
  expect(context.text.chunks.map((chunk) => chunk.text).join("")).toContain(
    '6  {"requestId":"r1","retry":true}',
  );
});

test("expanded neighboring contexts merge and gaps explain how much output is hidden", () => {
  const lines = Array.from({ length: 15 }, (_, i) =>
    i === 2 || i === 12 ? "TOKEN" : `line ${i}`,
  );
  const output = formatLogOutput(
    lines,
    findLogMatches(lines, "token"),
    0,
    theme,
    { onlyMatches: true, columns: 40, contextLines: 1 },
  );
  expect(output.rows).toEqual([1, 2, 3, -1, 11, 12, 13]);
  expect(output.text.chunks.map((chunk) => chunk.text).join("")).toContain(
    "7 lines hidden",
  );
  expect(output.columns).toBeGreaterThanOrEqual("  … 7 lines hidden …".length);
  const expanded = formatLogOutput(
    lines,
    findLogMatches(lines, "token"),
    0,
    theme,
    { onlyMatches: true, columns: 40, contextLines: 5 },
  );
  expect(expanded.rows).not.toContain(-1);
  expect(new Set(expanded.rows).size).toBe(expanded.rows.length);
});
