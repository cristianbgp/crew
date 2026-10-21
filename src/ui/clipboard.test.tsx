import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { EmbeddedTerminalRenderable } from "@opentui/core";
import { App } from "./App";
import { createProcessManager } from "../process/manager";
const service = {
  id: "web",
  repo: "p",
  cwd: process.cwd(),
  command: "sleep 30",
  autostart: false,
};
test("mouse Copy sends only selected text to the clipboard and removes the typing hint", async () => {
  let clipboardText = "";
  const clipboard = {
    async writeText(text: string) {
      clipboardText = text;
      return "copied" as const;
    },
  };
  const m = createProcessManager([service]);
  const t = await testRender(
    <App
      config={{ name: "p", services: [service] }}
      manager={m}
      clipboard={clipboard}
      onQuit={() => {}}
    />,
    { width: 100, height: 26 },
  );
  try {
    await t.renderOnce();
    const term = t.renderer.root.findDescendantById(
      "terminal-web",
    ) as EmbeddedTerminalRenderable;
    term.write("SELECT another phrase");
    await t.renderOnce();
    await act(async () => {
      await t.mockMouse.drag(term.x, term.y, term.x + 5, term.y);
    });
    expect(term.getSelectedText()).toBe("SELECT");
    await t.renderOnce();
    const lines = t.captureCharFrame().split("\n");
    const y = lines.findIndex((l) => l.includes("Copy"));
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf("Copy") + 1, y);
    });
    await t.renderOnce();
    expect(clipboardText).toBe("SELECT");
    expect(t.captureCharFrame()).toContain("Copied selection");
    expect(t.captureCharFrame()).not.toContain("Click the terminal to type");
  } finally {
    await act(async () => {
      await m.shutdown();
      await t.dispose();
    });
  }
});
test("Ctrl+C copies a selection instead of sending it to the child", async () => {
  let clipboardText = "";
  const clipboard = {
    async writeText(text: string) {
      clipboardText = text;
      return "copied" as const;
    },
  };
  const m = createProcessManager([service], { stopTimeoutMs: 100 });
  const t = await testRender(
    <App
      config={{ name: "p", services: [service] }}
      manager={m}
      clipboard={clipboard}
      onQuit={() => {}}
    />,
    { width: 100, height: 26, exitOnCtrlC: false },
  );
  try {
    await act(async () => {
      await m.start("web");
    });
    await t.renderOnce();
    const term = t.renderer.root.findDescendantById(
      "terminal-web",
    ) as EmbeddedTerminalRenderable;
    term.write("COPY");
    await t.renderOnce();
    await act(async () => {
      await t.mockMouse.drag(term.x, term.y, term.x + 3, term.y);
      t.mockInput.pressCtrlC();
    });
    expect(clipboardText).toBe("COPY");
    expect(m.getSnapshot()[0]!.state).toBe("running");
  } finally {
    await act(async () => {
      await m.shutdown();
      await t.dispose();
    });
  }
});
test("clipboard errors are shown instead of a success message", async () => {
  const clipboard = {
    async writeText(_text: string): Promise<"copied"> {
      throw new Error("Clipboard unavailable");
    },
  };
  const m = createProcessManager([service]);
  const t = await testRender(
    <App
      config={{ name: "p", services: [service] }}
      manager={m}
      clipboard={clipboard}
      onQuit={() => {}}
    />,
    { width: 100, height: 26 },
  );
  try {
    await t.renderOnce();
    const term = t.renderer.root.findDescendantById(
      "terminal-web",
    ) as EmbeddedTerminalRenderable;
    term.write("some logs");
    await t.renderOnce();
    const lines = t.captureCharFrame().split("\n");
    const y = lines.findIndex((l) => l.includes("Copy"));
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf("Copy") + 1, y);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Clipboard unavailable");
    expect(t.captureCharFrame()).not.toContain("Copied selection");
  } finally {
    await act(async () => {
      await m.shutdown();
      await t.dispose();
    });
  }
});
