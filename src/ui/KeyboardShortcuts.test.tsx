import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { CrewRoot } from "./CrewRoot";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";

test("F1 help isolates editor input and Escape preserves unsaved fields; Ctrl+Q quits", async () => {
  const manager = createProcessManager([]);
  let quits = 0;
  const t = await testRender(
    <CrewRoot
      initialDocument={null}
      path="/tmp/crew-shortcuts/crew.toml"
      manager={manager}
      onQuit={() => {
        quits++;
      }}
    />,
    { width: 65, height: 15, exitOnCtrlC: false },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("Unsaved workspace");
      t.mockInput.pressKey("F1");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Keyboard shortcuts");
    expect(t.captureCharFrame()).toContain("Ctrl+Q");
    await act(async () => {
      t.mockInput.pressKey("\x1b[6~");
      t.mockInput.pressKey("END");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Ctrl+Enter");
    await act(async () => {
      await t.mockInput.typeText("oops");
      await t.mockInput.pasteBracketedText("paste leak");
      t.mockInput.pressEscape();
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Unsaved workspace");
    expect(t.captureCharFrame()).not.toContain("oops");
    expect(t.captureCharFrame()).not.toContain("paste leak");
    expect(quits).toBe(0);
    await act(async () => {
      t.mockInput.pressKey("q", { ctrl: true });
    });
    expect(quits).toBe(1);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("visible help and F1 preserve terminal input; Ctrl+Q shuts down the running service", async () => {
  const services = [
    {
      id: "worker",
      repo: "test",
      cwd: process.cwd(),
      command:
        'printf READY; while IFS= read -r line; do printf "ANSWER:%s\\n" "$line"; done',
      autostart: true,
    },
  ];
  const manager = createProcessManager(services, { stopTimeoutMs: 100 });
  const { App } = await import("./App");
  const { KeyboardShortcuts } = await import("./KeyboardShortcuts");
  const t = await testRender(
    <KeyboardShortcuts
      onQuit={() => {
        void manager.shutdown();
      }}
    >
      <App
        config={{ name: "Test", services }}
        manager={manager}
        onQuit={() => {
          void manager.shutdown();
        }}
      />
    </KeyboardShortcuts>,
    { width: 100, height: 30, exitOnCtrlC: false },
  );
  const output = () => new TextDecoder().decode(manager.history("worker"));
  try {
    await act(async () => {
      await manager.start("worker");
      await waitFor(() => output().includes("READY"));
    });
    await t.renderOnce();
    const lines = t.captureCharFrame().split("\n");
    const y = lines.findIndex((line) => line.includes("F1 Shortcuts"));
    expect(y).toBeGreaterThanOrEqual(0);
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf("F1 Shortcuts") + 1, y);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Keyboard shortcuts");
    await act(async () => {
      await t.mockInput.typeText("leak");
      await t.mockInput.pasteBracketedText("paste leak");
      t.mockInput.pressEnter();
      t.mockInput.pressKey("F1");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Keyboard shortcuts");
    await act(async () => {
      await t.mockInput.typeText("hello");
      t.mockInput.pressEnter();
      await waitFor(() => output().includes("ANSWER:hello"));
    });
    expect(output()).not.toContain("leak");
    await act(async () => {
      t.mockInput.pressKey("q", { ctrl: true });
      await waitFor(() => manager.getSnapshot()[0]!.state === "stopped");
    });
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("shortcut search filters actions, keys and scope without leaking into the form", async () => {
  const manager = createProcessManager([]);
  const t = await testRender(
    <CrewRoot
      initialDocument={null}
      path="/tmp/crew-shortcuts/crew.toml"
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12, exitOnCtrlC: false },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("Keep this workspace");
      t.mockInput.pressKey("F1");
    });
    await t.renderOnce();
    expect(t.renderer.currentFocusedRenderable?.id).toBe("shortcut-search");
    await act(async () => {
      await t.mockInput.typeText("save");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Save service");
    expect(t.captureCharFrame()).toContain("Ctrl+Enter");
    expect(t.captureCharFrame()).toContain("Forms");
    expect(t.captureCharFrame()).not.toContain("Quit crew");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.pasteBracketedText("ctrl+q");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Quit crew");
    expect(t.captureCharFrame()).toContain("Everywhere");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("forms");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Service forms");
    expect(t.captureCharFrame()).not.toContain("Daily essentials");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("restart");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Restart service");
    expect(t.captureCharFrame()).toContain("Ctrl+K → restart");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("unmatchedshortcut");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("No shortcuts found");
    await act(async () => {
      t.mockInput.pressEscape();
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Keep this workspace");
    expect(t.captureCharFrame()).not.toContain("unmatchedshortcut");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("help footer keyboard actions and command-palette entry work", async () => {
  const { App } = await import("./App");
  const { KeyboardShortcuts } = await import("./KeyboardShortcuts");
  const services = [
    {
      id: "web",
      repo: "demo",
      cwd: process.cwd(),
      command: "cat",
      autostart: false,
    },
  ];
  const manager = createProcessManager(services);
  let quits = 0;
  let sent = "";
  const instrumented = {
    ...manager,
    write: (id: string, bytes: Uint8Array) => {
      sent += new TextDecoder().decode(bytes);
      manager.write(id, bytes);
    },
  };
  const t = await testRender(
    <KeyboardShortcuts
      onQuit={() => {
        quits++;
      }}
    >
      <App
        config={{ name: "Demo", services }}
        manager={instrumented}
        onQuit={() => {
          quits++;
        }}
      />
    </KeyboardShortcuts>,
    { width: 100, height: 30 },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("p", { ctrl: true });
      t.mockInput.pressKey("r", { ctrl: true });
      t.mockInput.pressTab();
      t.mockInput.pressArrow("up");
    });
    expect(sent).toContain("\x10\x12\t\x1b[A");
    await act(async () => {
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await act(async () => {
      await t.mockInput.typeText("shortcuts");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("F1");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.renderer.currentFocusedRenderable?.id).toBe("shortcut-search");
    expect(t.captureCharFrame()).toContain("Daily essentials");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(quits).toBe(0);
    await act(async () => {
      t.mockInput.pressTab();
      t.mockInput.pressTab();
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Keyboard shortcuts");
    expect(t.renderer.currentFocusedRenderable?.id).toBe("terminal-web");
    await act(async () => {
      t.mockInput.pressKey("F1");
    });
    await act(async () => {
      t.mockInput.pressTab();
      t.mockInput.pressEnter();
    });
    expect(quits).toBe(1);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
