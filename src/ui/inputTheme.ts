import type { InputRenderableOptions } from "@opentui/core";
import type { CrewPalette } from "./theme";

export function inputTheme(c: CrewPalette) {
  // OpenTUI stores focused colors separately; update both on theme changes.
  return {
    backgroundColor: c.panel,
    focusedBackgroundColor: c.focus,
    textColor: c.text,
    focusedTextColor: c.text,
    placeholderColor: c.text,
    selectionBg: c.accent,
    selectionFg: c.bg,
    cursorColor: c.text,
  } satisfies Partial<InputRenderableOptions>;
}
