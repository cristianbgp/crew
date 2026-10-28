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
