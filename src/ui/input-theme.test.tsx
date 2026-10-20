import { expect, test } from "bun:test";
import { act } from "react";
import type { InputRenderable, RGBA } from "@opentui/core";
import { testRender } from "@opentui/react/test-utils";
import { createProcessManager } from "../process/manager";
import { SetupWizard } from "./SetupWizard";
import { ServiceEditor } from "./ServiceEditor";
import { ServiceSwitcher } from "./ServiceSwitcher";
import { LogInspector } from "./LogInspector";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ThemeProvider, themes } from "./theme";

const noop = () => {};
const config = { name: "example", services: [] };
const screens = [
  {
    name: "workspace setup",
    id: "workspace-name",
    render: () => (
      <SetupWizard
        baseDir="/tmp/example"
        onFinish={async () => {}}
        onCancel={noop}
      />
    ),
  },
  {
    name: "add service",
    id: "field-0",
    render: () => (
      <ServiceEditor
        baseDir="/tmp/example"
        onSave={async () => {}}
        onCancel={noop}
      />
    ),
  },
  {
    name: "edit service",
    id: "field-1",
    render: () => (
      <ServiceEditor
        baseDir="/tmp/example"
        initial={{
          id: "web",
          repo: "example",
          cwd: "/tmp/example",
          command: "echo hello",
          autostart: false,
        }}
        onSave={async () => {}}
        onCancel={noop}
      />
    ),
  },
  {
    name: "service switcher",
    id: "service-search",
    render: () => (
      <ServiceSwitcher
        config={config}
        snapshots={[]}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: "command palette",
    id: "service-search",
    render: () => (
      <ServiceSwitcher
        config={config}
        snapshots={[]}
        items={[]}
        onSelect={noop}
        onClose={noop}
      />
    ),
  },
  {
    name: "output search",
    id: "log-search",
    render: () => (
      <LogInspector
        id="web"
        manager={createProcessManager([
          {
            id: "web",
            repo: "example",
            cwd: "/tmp/example",
            command: "echo hello",
            autostart: false,
          },
        ])}
        onClose={noop}
      />
    ),
  },
  {
    name: "shortcut search",
    id: "shortcut-search",
    render: () => (
      <KeyboardShortcuts onQuit={noop}>
        <box />
      </KeyboardShortcuts>
    ),
    openHelp: true,
  },
];

const rgb = (hex: string) =>
  [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
function contrast(fg: RGBA, bg: RGBA) {
  const luminance = (color: RGBA) => {
    const [r, g, b] = color
      .toInts()
      .slice(0, 3)
      .map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    return r! * 0.2126 + g! * 0.7152 + b! * 0.0722;
  };
  const a = luminance(fg),
    b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const screen of screens) {
  test(`${screen.name}: input stays readable across focus and live light/dark changes`, async () => {
    const t = await testRender(
      <ThemeProvider>{screen.render()}</ThemeProvider>,
      { width: 100, height: 32 },
    );
    try {
      if (screen.openHelp) {
        await act(async () => {
          t.mockInput.pressKey("F1");
        });
      }
      const input = t.renderer.root.findDescendantById(
        screen.id,
      ) as InputRenderable;
      expect(input).toBeDefined();
      await act(async () => {
        input.focus();
        input.setText("");
        t.mockInput.typeText("readable");
      });
      for (const mode of ["light", "dark", "light"] as const) {
        await act(async () => {
          t.renderer.emit("theme_mode", mode);
        });
        expect(t.renderer.root.findDescendantById(screen.id)).toBe(input);
        expect(t.renderer.currentFocusedRenderable).toBe(input);
        for (const focused of [true, false, true]) {
          await act(async () => {
            if (focused) input.focus();
            else input.blur();
          });
          await t.renderOnce();
          const spans = t
            .captureSpans()
            .lines[input.y]!.spans.filter((span) =>
              span.text.includes("readable"),
            );
          expect(spans.length).toBeGreaterThan(0);
          for (const span of spans) {
            expect(span.fg.toInts().slice(0, 3)).toEqual(
              rgb(themes[mode].text),
            );
            expect(span.bg.toInts().slice(0, 3)).toEqual(
              rgb(focused ? themes[mode].focus : themes[mode].panel),
            );
            expect(contrast(span.fg, span.bg)).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
      await act(async () => {
        input.selectAll();
      });
      for (const mode of ["dark", "light"] as const) {
        await act(async () => {
          t.renderer.emit("theme_mode", mode);
        });
        await t.renderOnce();
        expect(input.getSelectedText()).toBe("readable");
        const spans = t
          .captureSpans()
          .lines[input.y]!.spans.filter((span) =>
            span.text.includes("readable"),
          );
        expect(spans.length).toBeGreaterThan(0);
        for (const span of spans) {
          expect(span.fg.toInts().slice(0, 3)).toEqual(rgb(themes[mode].bg));
          expect(span.bg.toInts().slice(0, 3)).toEqual(
            rgb(themes[mode].accent),
          );
          expect(contrast(span.fg, span.bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    } finally {
      await act(async () => {
        await t.dispose();
      });
    }
  });
  for (const mode of ["light", "dark"] as const) {
    test(`${screen.name}: initial ${mode} text and placeholders are readable in a small window`, async () => {
      const t = await testRender(
        <ThemeProvider preference={mode}>{screen.render()}</ThemeProvider>,
        { width: 65, height: 15 },
      );
      try {
        if (screen.openHelp)
          await act(async () => {
            t.mockInput.pressKey("F1");
          });
        const input = t.renderer.root.findDescendantById(
          screen.id,
        ) as InputRenderable;
        await t.renderOnce();
        let expected = input.value || input.placeholder;
        // An empty form has no placeholder; check its freshly typed content too.
        if (!expected) {
          await act(async () => {
            input.focus();
            t.mockInput.typeText("visible");
          });
          await t.renderOnce();
          expected = "visible";
        }
        const spans = t
          .captureSpans()
          .lines[input.y]!.spans.filter((span) => span.text.includes(expected));
        expect(spans.length).toBeGreaterThan(0);
        for (const span of spans) {
          expect(span.fg.toInts().slice(0, 3)).toEqual(rgb(themes[mode].text));
          expect(contrast(span.fg, span.bg)).toBeGreaterThanOrEqual(4.5);
        }
      } finally {
        await act(async () => {
          await t.dispose();
        });
      }
    });
  }
}
