import { RGBA, StyledText, type TextChunk } from "@opentui/core";
import { stringWidth } from "bun";
import type { CrewPalette } from "./theme";

export type LogMatch = { line: number; start: number; end: number };
export const logContextSizes = [0, 1, 3, 5, 10] as const;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Result previews keep their line numbers while revealing a distant match. */
function snippet(line: string, focus: LogMatch | undefined, columns: number) {
  if (stringWidth(line) <= columns) return { start: 0, end: line.length };
  const left = Math.max(0, stringWidth(line.slice(0, focus?.start ?? 0)) - 8);
  let position = 0;
  let start = 0;
  let end = 0;
  let used = 0;
  for (const part of graphemes.segment(line)) {
    const width = stringWidth(part.segment);
    if (position + width <= left) {
      position += width;
      start = part.index + part.segment.length;
      continue;
    }
    if (used + width > columns - (start ? 1 : 0) - 1) break;
    used += width;
    end = part.index + part.segment.length;
  }
  return { start, end: Math.max(start, end) };
}

/** Treat user input as literal text, retaining offsets in the original output. */
export function findLogMatches(lines: string[], query: string): LogMatch[] {
  if (!query) return [];
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "gi",
  );
  return lines.flatMap((text, line) =>
    Array.from(text.matchAll(pattern), (match) => ({
      line,
      start: match.index!,
      end: match.index! + match[0].length,
    })),
  );
}

/** Reuse colors and merge adjacent equal styles so dense matches stay cheap. */
export function formatLogOutput(
  lines: string[],
  matches: LogMatch[],
  active: number,
  palette: CrewPalette,
  view?: { onlyMatches: boolean; columns: number; contextLines?: number },
) {
  const colors = Object.fromEntries(
    Object.entries(palette).map(([name, value]) => [name, RGBA.fromHex(value)]),
  ) as Record<keyof CrewPalette, RGBA>;
  const chunks: TextChunk[] = [];
  function append(text: string, fg = colors.text, bg?: RGBA) {
    if (!text) return;
    const previous = chunks.at(-1);
    if (previous && previous.fg === fg && previous.bg === bg)
      previous.text += text;
    else chunks.push({ __isChunk: true, text, fg, bg });
  }
  let matchIndex = 0;
  let columns = 1;
  const visible = new Set<number>();
  if (view?.onlyMatches) {
    const context = Number.isFinite(view.contextLines)
      ? Math.max(0, Math.min(10, Math.floor(view.contextLines!)))
      : 1;
    const matchingLines = new Set<number>();
    for (const match of matches) matchingLines.add(match.line);
    for (const line of matchingLines) {
      for (
        let index = Math.max(0, line - context);
        index <= Math.min(lines.length - 1, line + context);
        index++
      )
        visible.add(index);
    }
  } else lines.forEach((_, index) => visible.add(index));
  const rows: number[] = [];
  const indices = [...visible].sort((a, b) => a - b);
  indices.forEach((index, row) => {
    const line = lines[index]!;
    if (row && index > indices[row - 1]! + 1) {
      const gap = `  … ${index - indices[row - 1]! - 1} lines hidden …`;
      append(gap + "\n", colors.muted);
      columns = Math.max(columns, stringWidth(gap));
      rows.push(-1);
    }
    rows.push(index);
    while (matches[matchIndex] && matches[matchIndex]!.line < index)
      matchIndex++;
    const firstMatch =
      matches[matchIndex]?.line === index ? matches[matchIndex] : undefined;
    const focus =
      matches[active]?.line === index ? matches[active] : firstMatch;
    const window = view?.onlyMatches
      ? snippet(
          line,
          focus,
          Math.max(1, view.columns - String(index + 1).length - 2),
        )
      : { start: 0, end: line.length };
    const display = `${index + 1}  ${window.start ? "…" : ""}${line.slice(window.start, window.end)}${window.end < line.length ? "…" : ""}`;
    columns = Math.max(columns, stringWidth(display));
    append(`${index + 1}  `, colors.muted);
    if (window.start) append("…", colors.muted);
    let start = window.start;
    while (matches[matchIndex]?.line === index) {
      const match = matches[matchIndex]!;
      const begin = Math.max(window.start, match.start);
      const end = Math.min(window.end, match.end);
      if (begin < end) {
        append(line.slice(start, begin));
        append(
          line.slice(begin, end),
          matchIndex === active ? colors.bg : colors.text,
          matchIndex === active ? colors.accent : colors.focus,
        );
        start = end;
      }
      matchIndex++;
    }
    append(line.slice(start, window.end));
    if (window.end < line.length) append("…", colors.muted);
    if (row < indices.length - 1) append("\n");
  });
  return { text: new StyledText(chunks), columns, rows };
}
