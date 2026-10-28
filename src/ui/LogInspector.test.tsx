import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { rgbToHex, type TextRenderable } from "@opentui/core";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
import { LogInspector } from "./LogInspector";
import { ThemeProvider, themes } from "./theme";

for (const appearance of ["light", "dark"] as const) {
  test(`log search reveals distant and horizontally clipped matches in ${appearance} mode`, async () => {
    const lines = [
      "first TOKEN context",
      ...Array.from({ length: 40 }, (_, i) => `context ${i}`),
      `${"界".repeat(50)} last token context`,
    ];
    const manager = createProcessManager([
      {
        id: "web",
        repo: "demo",
        cwd: process.cwd(),
        command: `printf '${lines.join("\\n")}\\n'`,
        autostart: false,
      },
    ]);
    await manager.start("web");
    await waitFor(() =>
      new TextDecoder()
        .decode(manager.history("web"))
        .includes("last token context"),
    );
    const t = await testRender(
      <ThemeProvider preference={appearance}>
        <LogInspector id="web" manager={manager} onClose={() => {}} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    );
    try {
      await act(async () => {
        await t.mockInput.typeText("token");
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("first TOKEN context");
      expect(t.captureCharFrame()).toContain("1 of 2");
      await act(async () => {
        t.mockInput.pressEnter();
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("last token context");
      expect(t.captureCharFrame()).toContain("2 of 2");
      const output = t.renderer.root.findDescendantById(
        "log-output",
      ) as TextRenderable;
      const highlights = output.chunks.filter(
        (chunk) => chunk.text.toLowerCase() === "token",
      );
      expect(highlights).toHaveLength(2);
      expect(rgbToHex(highlights[0]!.bg!)).toBe(themes[appearance].focus);
      expect(rgbToHex(highlights[1]!.bg!)).toBe(themes[appearance].accent);
      expect(rgbToHex(highlights[1]!.fg!)).toBe(themes[appearance].bg);
      await act(async () => {
        t.mockInput.pressKey("a", { ctrl: true });
        await t.mockInput.typeText("missing");
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("No matches.");
    } finally {
      await act(async () => {
        await manager.shutdown();
        await t.dispose();
      });
    }
  });
}
