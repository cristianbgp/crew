import { RGBA, StyledText, type TextChunk } from "@opentui/core";
import { stringWidth } from "bun";
import type { CrewPalette } from "./theme";

export type LogMatch = { line: number; start: number; end: number };

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
  lines.forEach((line, index) => {
    columns = Math.max(columns, stringWidth(`${index + 1}  ${line}`));
    append(`${index + 1}  `, colors.muted);
    let start = 0;
    while (matches[matchIndex]?.line === index) {
      const match = matches[matchIndex]!;
      append(line.slice(start, match.start));
      append(
        line.slice(match.start, match.end),
        matchIndex === active ? colors.bg : colors.text,
        matchIndex === active ? colors.accent : colors.focus,
      );
      start = match.end;
      matchIndex++;
    }
    append(line.slice(start) + (index < lines.length - 1 ? "\n" : ""));
  });
  return { text: new StyledText(chunks), columns };
}
