import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { BoxRenderable, EmbeddedTerminalRenderable } from "@opentui/core";
import { ThemeProvider, themes, useTheme } from "./theme";
import { App } from "./App";
import { Button } from "./Button";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
function Probe() {
  const c = useTheme();
  return (
    <box id="theme-probe" backgroundColor={c.bg}>
      <Button id="theme-button" label="Action" onPress={() => {}} />
    </box>
  );
}
test("terminal theme updates recolor mounted controls, including a pressed button's release", async () => {
  const t = await testRender(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
    { width: 40, height: 12 },
  );
  try {
    const panel = t.renderer.root.findDescendantById(
      "theme-probe",
    ) as BoxRenderable;
    const button = t.renderer.root.findDescendantById(
      "theme-button",
    ) as BoxRenderable;
    const original = panel.backgroundColor.toString();
    await act(async () => {
      await t.mockMouse.click(button.x + 1, button.y);
      t.renderer.stdin.emit(
        "data",
        Buffer.from("\x1b]10;#202833\x07\x1b]11;#ffffff\x07"),
      );
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(panel.backgroundColor.toString()).not.toBe(original);
    await act(async () => {
      await t.mockMouse.moveTo(39, 11);
      button.blur();
      await Bun.sleep(220);
    });
    expect(button.backgroundColor.toInts().slice(0, 3)).toEqual([
      203, 211, 221,
    ]);
    await act(async () => {
      t.renderer.emit("theme_mode", "dark");
      await Bun.sleep(40);
    });
    expect(panel.backgroundColor.toString()).toBe(original);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("explicit theme overrides ignore host changes", async () => {
  const t = await testRender(
    <ThemeProvider preference="light">
      <Probe />
    </ThemeProvider>,
    { width: 40, height: 12 },
  );
  try {
    const panel = t.renderer.root.findDescendantById(
      "theme-probe",
    ) as BoxRenderable;
    const original = panel.backgroundColor.toString();
    expect(panel.backgroundColor.toInts().slice(0, 3)).toEqual([245, 246, 248]);
    await act(async () => {
      t.renderer.emit("theme_mode", "dark");
      await Bun.sleep(40);
    });
    expect(panel.backgroundColor.toString()).toBe(original);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("theme changes preserve the live terminal, selection, colors and subsequent input", async () => {
  const services = [
    {
      id: "web",
      repo: "demo",
      cwd: process.cwd(),
      command:
        "printf 'plain\\r\\n\\033[38;2;123;45;67mcolor\\033[0m\\r\\n'; cat",
      autostart: false,
    },
  ];
  const manager = createProcessManager(services, { stopTimeoutMs: 40 });
  const t = await testRender(
    <ThemeProvider>
      <App
        config={{ name: "Demo", services }}
        manager={manager}
        onQuit={() => {}}
      />
    </ThemeProvider>,
    { width: 65, height: 15 },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("color"),
      );
    });
    await t.renderOnce();
    const terminal = t.renderer.root.findDescendantById(
      "terminal-web",
    ) as EmbeddedTerminalRenderable;
    const pid = manager.getSnapshot()[0]!.pid;
    const before = terminal.screen().text;
    await act(async () => {
      t.renderer.stdin.emit(
        "data",
        Buffer.from("\x1b]10;#202833\x07\x1b]11;#ffffff\x07"),
      );
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.renderer.root.findDescendantById("terminal-web")).toBe(terminal);
    expect(terminal.focused).toBe(true);
    expect(terminal.screen().text).toBe(before);
    expect(manager.getSnapshot()[0]!.pid).toBe(pid);
    const spans = t.captureSpans().lines.flatMap((line) => line.spans);
    expect(
      spans
        .find((span) => span.text.includes("plain"))!
        .fg.toInts()
        .slice(0, 3),
    ).toEqual([32, 40, 51]);
    expect(
      spans
        .find((span) => span.text.includes("color"))!
        .fg.toInts()
        .slice(0, 3),
    ).toEqual([123, 45, 67]);
    await act(async () => {
      await t.mockMouse.drag(
        terminal.x,
        terminal.y,
        terminal.x + 4,
        terminal.y,
      );
    });
    const selection = terminal.getSelectedText();
    expect(selection).toContain("plain");
    await act(async () => {
      t.renderer.emit("theme_mode", "dark");
      await Bun.sleep(40);
    });
    expect(terminal.getSelectedText()).toBe(selection);
    expect(manager.getSnapshot()[0]!.pid).toBe(pid);
    await act(async () => {
      await t.mockInput.typeText("after-theme");
      t.mockInput.pressEnter();
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("after-theme"),
      );
    });
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}
test("both palettes keep readable text and status colors on their surfaces", () => {
  for (const c of Object.values(themes))
    for (const bg of [c.bg, c.sidebar, c.panel])
      for (const fg of [c.text, c.muted, c.accent, c.danger, c.yellow]) {
        const a = luminance(fg),
          b = luminance(bg);
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
      }
});
