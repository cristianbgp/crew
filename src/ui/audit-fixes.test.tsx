import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
import { clickText } from "../../tests/ui-helpers";
const services = [
  {
    id: "web",
    repo: "demo",
    cwd: process.cwd(),
    command:
      'printf READY; while IFS= read -r line; do printf "ANSWER:%s\\n" "$line"; done',
    autostart: false,
  },
  {
    id: "bad",
    repo: "demo",
    cwd: process.cwd(),
    command: "exit 7",
    autostart: false,
  },
];
test("Copy restores terminal input and a newly selected failure outranks earlier success", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 50 });
  const t = await testRender(
    <KeyboardShortcuts onQuit={() => {}}>
      <App
        config={{ name: "Demo", services }}
        manager={manager}
        onQuit={() => {}}
        clipboard={{ writeText: async () => "copied" }}
      />
    </KeyboardShortcuts>,
    { width: 100, height: 30 },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("READY"),
      );
    });
    await clickText(t, "Copy");
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    await act(async () => {
      await t.mockInput.typeText("aftercopy");
      t.mockInput.pressEnter();
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("ANSWER:aftercopy"),
      );
    });
    await clickText(t, "bad");
    await act(async () => {
      await manager.start("bad");
      await waitFor(() => manager.getSnapshot()[1]!.state === "error");
    });
    await t.renderOnce();
    expect(t.captureCharFrame().split("\n")[29]).toContain(
      "Exited with code 7",
    );
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
test("a long service name cannot displace status in a compact header", async () => {
  const defs = [{ ...services[0]!, id: "very-long-name-".repeat(8) }];
  const manager = createProcessManager(defs);
  const t = await testRender(
    <App
      config={{ name: "Demo", services: defs }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame().split("\n")[0]).toContain("stopped");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("F6 leaves terminal keys intact and menus support keyboard activation", async () => {
  const manager = createProcessManager(services);
  let edited = "";
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
      onEdit={(id) => {
        edited = id;
      }}
    />,
    { width: 65, height: 15 },
  );
  try {
    await t.renderOnce();
    const terminal = t.renderer.root.findDescendantById("terminal-web")!;
    await act(async () => {
      t.mockInput.pressTab();
    });
    expect(terminal.focused).toBe(true);
    await act(async () => {
      t.mockInput.pressKey("F6");
    });
    expect(terminal.focused).toBe(false);
    await clickText(t, "More");
    await act(async () => {
      t.mockInput.pressArrow("down");
      t.mockInput.pressEnter();
    });
    expect(edited).toBe("web");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("starting a silent service and copying empty output both restore typing", async () => {
  const defs = [{ ...services[0]!, command: "cat" }];
  const manager = createProcessManager(defs, { stopTimeoutMs: 50 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services: defs }}
      manager={manager}
      onQuit={() => {}}
      clipboard={{ writeText: async () => "copied" }}
    />,
    { width: 65, height: 15 },
  );
  try {
    await clickText(t, "Start");
    await act(async () => {
      await waitFor(() => manager.getSnapshot()[0]!.state === "running");
    });
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    await clickText(t, "Copy");
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    await act(async () => {
      await t.mockInput.typeText("silent-input");
      t.mockInput.pressEnter();
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("silent-input"),
      );
    });
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
