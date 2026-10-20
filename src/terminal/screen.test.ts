import { test, expect } from "bun:test";
import { createTestRenderer } from "@opentui/core/testing";
import { createServiceTerminal } from "./screen";

test("terminal panel interprets cursor, color and split UTF-8 without escaping its bounds", async () => {
  const t = await createTestRenderer({ width: 40, height: 8 });
  const s = createServiceTerminal(t.renderer, {
    id: "test",
    width: 20,
    height: 4,
    onInput() {},
    onResize() {},
  });
  t.renderer.root.add(s);
  try {
    s.write("hello\r\x1b[31mOK\x1b[0m\x1b[K");
    const bytes = new TextEncoder().encode("\r\nniño界");
    s.write(bytes.slice(0, 5));
    s.write(bytes.slice(5));
    await t.renderOnce();
    expect(s.screen().lines[0]).toBe("OK");
    expect(s.screen().lines[1]).toBe("niño界");
    expect(t.captureCharFrame().split("\n")[0]!.trimEnd()).toBe("OK");
    expect(t.captureSpans().lines[0]).toBeDefined();
    s.write("\x1b[?1049halt\x1b[?1049l");
    expect(s.screen().lines[0]).toBe("OK");
  } finally {
    await t.dispose();
  }
});
test("terminal keyboard goes only to a focused panel and resize reaches its process", async () => {
  const t = await createTestRenderer({ width: 30, height: 6 });
  let input = "";
  let size: number[] = [];
  const s = createServiceTerminal(t.renderer, {
    id: "test",
    width: "100%",
    height: "100%",
    onInput(bytes) {
      input += new TextDecoder().decode(bytes);
    },
    onResize(c, r) {
      size = [c, r];
    },
  });
  t.renderer.root.add(s);
  try {
    await t.renderOnce();
    s.focus();
    await t.mockInput.typeText("abc");
    expect(input).toBe("abc");
    s.blur();
    await t.mockInput.typeText("hidden");
    expect(input).toBe("abc");
    t.resize(50, 10);
    await t.renderOnce();
    expect(size).toEqual([50, 10]);
  } finally {
    await t.dispose();
  }
});
test("panel preserves truecolor, wide-cell cursor placement, selection and scrollback navigation", async () => {
  const t = await createTestRenderer({ width: 30, height: 7 });
  const s = createServiceTerminal(t.renderer, {
    id: "native-boundary",
    width: 20,
    height: 5,
    onInput() {},
    onResize() {},
  });
  t.renderer.root.add(s);
  try {
    s.write("\x1b[38;2;12;34;56mSELECT\x1b[0m界");
    s.focus();
    await t.renderOnce();
    const span = t.captureSpans().lines[0]!.spans[0]!;
    expect(span.fg.toInts()).toEqual([12, 34, 56, 255]);
    expect(span.text).toBe("SELECT");
    expect(s.screen().cursor.x).toBe(8);
    await t.mockMouse.drag(0, 0, 5, 0);
    expect(s.getSelectedText()).toBe("SELECT");
    s.write(
      "\r\n" + Array.from({ length: 30 }, (_, i) => `row-${i}`).join("\r\n"),
    );
    await t.renderOnce();
    const before = t.captureCharFrame();
    expect(before).toContain("row-29");
    await t.mockMouse.scroll(5, 2, "up");
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toBe(before);
    expect(
      t
        .captureCharFrame()
        .split("\n")
        .slice(0, 5)
        .every((line) => line.slice(20).trim() === ""),
    ).toBe(true);
  } finally {
    await t.dispose();
  }
});
