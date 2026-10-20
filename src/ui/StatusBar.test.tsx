import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { App } from "./App";
import { createProcessManager } from "../process/manager";

test("one status bar keeps quit at the right and feedback between the controls", async () => {
  const manager = createProcessManager([]);
  let quits = 0;
  const t = await testRender(
    <KeyboardShortcuts
      onQuit={() => {
        quits++;
      }}
    >
      <App
        config={{ name: "Demo", services: [] }}
        manager={manager}
        onQuit={() => {
          quits++;
        }}
        notice="Configuration reloaded"
      />
    </KeyboardShortcuts>,
    { width: 100, height: 24 },
  );
  try {
    await t.renderOnce();
    const frame = t.captureCharFrame();
    expect(frame.match(/Quit/g)?.length).toBe(1);
    const lines = frame.split("\n");
    const bottom = lines[23]!;
    expect(bottom).toContain("F1 Shortcuts");
    expect(bottom).toContain("Configuration reloaded");
    expect(bottom.trimEnd().endsWith("Ctrl+Q Quit")).toBe(true);
    expect(bottom.indexOf("Ctrl+Q Quit")).toBeGreaterThan(80);
    await act(async () => {
      await t.mockMouse.click(bottom.indexOf("Ctrl+Q Quit") + 1, 23);
    });
    expect(quits).toBe(1);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("long feedback cannot push the compact status controls off screen", async () => {
  const manager = createProcessManager([]);
  const t = await testRender(
    <KeyboardShortcuts onQuit={() => {}}>
      <App
        config={{ name: "Demo", services: [] }}
        manager={manager}
        onQuit={() => {}}
        notice={"Saved changes in a directory with a very long name. ".repeat(
          5,
        )}
      />
    </KeyboardShortcuts>,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    const bottom = t.captureCharFrame().split("\n")[11]!;
    expect(bottom).toContain("F1 Help");
    expect(bottom).toContain("Saved");
    expect(bottom.trimEnd().endsWith("Ctrl+Q Quit")).toBe(true);
    await act(async () => {
      await t.mockMouse.click(bottom.indexOf("F1 Help") + 1, 11);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Keyboard shortcuts");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("truncated feedback opens complete details and Escape returns to the workspace", async () => {
  const manager = createProcessManager([]);
  const message =
    "Configuration failed: " + "folder/".repeat(12) + "FINAL-DETAIL";
  const t = await testRender(
    <KeyboardShortcuts onQuit={() => {}}>
      <App
        config={{ name: "Demo", services: [] }}
        manager={manager}
        onQuit={() => {}}
        notice={message}
      />
    </KeyboardShortcuts>,
    { width: 65, height: 20 },
  );
  try {
    await t.renderOnce();
    const bottom = t.captureCharFrame().split("\n")[19]!;
    await act(async () => {
      await t.mockMouse.click(bottom.indexOf("Configuration") + 1, 19);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Status details");
    expect(t.captureCharFrame()).toContain("FINAL-DETAIL");
    await act(async () => {
      t.mockInput.pressEscape();
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Status details");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
