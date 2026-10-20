import { test, expect } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { EmbeddedTerminalRenderable } from "@opentui/core";
import { createThemedStream } from "./themed-stream";
test("theme updates wait for split ANSI sequences and UTF-8 code points", async () => {
  const t = await createTestRenderer({ width: 40, height: 8 });
  const terminal = new EmbeddedTerminalRenderable(t.renderer, {
    id: "stream",
    width: 40,
    height: 8,
    transparentBackground: true,
  });
  t.renderer.root.add(terminal);
  const stream = createThemedStream(terminal);
  try {
    stream.setColors("#dce2ed", "#14171e");
    stream.write(new TextEncoder().encode("\x1b[38;2;"));
    stream.setColors("#202833", "#ffffff");
    stream.write(new TextEncoder().encode("123;45;67mcolor\x1b[0m\r\n"));
    const utf8 = new TextEncoder().encode("niño");
    stream.write(utf8.slice(0, 3));
    stream.setColors("#dce2ed", "#14171e");
    stream.write(utf8.slice(3));
    await t.renderOnce();
    expect(terminal.screen().lines[0]).toBe("color");
    expect(terminal.screen().lines[1]).toBe("niño");
    expect(
      t
        .captureSpans()
        .lines[0]!.spans.find((s) => s.text.includes("color"))!
        .fg.toInts()
        .slice(0, 3),
    ).toEqual([123, 45, 67]);
    expect(terminal.transparentBackground).toBe(true);
  } finally {
    await t.dispose();
  }
});
test("theme controls never become part of an unfinished OSC string", async () => {
  const t = await createTestRenderer({ width: 40, height: 8 });
  const terminal = new EmbeddedTerminalRenderable(t.renderer, {
    id: "stream",
    width: 40,
    height: 8,
    transparentBackground: true,
  });
  t.renderer.root.add(terminal);
  const stream = createThemedStream(terminal);
  try {
    stream.setColors("#dce2ed", "#14171e");
    stream.write(new TextEncoder().encode("\x1b]8;;https://example.com/"));
    stream.setColors("#202833", "#ffffff");
    expect(terminal.transparentBackground).toBe(false);
    stream.write(new TextEncoder().encode("docs\x1b\\link\x1b]8;;\x1b\\"));
    await t.renderOnce();
    expect(terminal.screen().lines[0]).toBe("link");
    expect(terminal.transparentBackground).toBe(true);
    expect(
      t
        .captureSpans()
        .lines[0]!.spans.find((s) => s.text.includes("link"))!
        .fg.toInts()
        .slice(0, 3),
    ).toEqual([32, 40, 51]);
  } finally {
    await t.dispose();
  }
});
