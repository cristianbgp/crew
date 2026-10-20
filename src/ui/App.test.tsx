import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
const services = [
  {
    id: "web",
    repo: "demo",
    cwd: process.cwd(),
    command: 'printf WEB; read line; printf "ANSWER:%s" "$line"; sleep 30',
    autostart: true,
  },
  {
    id: "api",
    repo: "demo",
    cwd: process.cwd(),
    command: "printf API; sleep 30",
    autostart: false,
  },
];
test("sidebar switches retained interactive terminals with mouse and visible controls", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 100 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 100, height: 26, exitOnCtrlC: false },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await manager.start("api");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("WEB"),
      );
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Restart");
    expect(t.captureCharFrame()).toContain("WEB");
    expect(t.captureCharFrame()).toContain("● web");
    const clickText = async (label: string) => {
      const lines = t.captureCharFrame().split("\n");
      const y = lines.findIndex((l) => l.includes(label));
      expect(y).toBeGreaterThanOrEqual(0);
      await act(async () => {
        await t.mockMouse.click(lines[y]!.indexOf(label) + 1, y);
      });
      await t.renderOnce();
    };
    await clickText("api");
    expect(t.captureCharFrame()).toContain("API");
    await clickText("web");
    await act(async () => {
      await t.mockMouse.click(40, 8);
      await t.mockInput.typeText("hello");
      t.mockInput.pressEnter();
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("ANSWER:hello"),
      );
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("ANSWER:hello");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
test("Ctrl+C interrupts the selected child while crew and other services survive", async () => {
  const defs = services.map((s) => ({ ...s, command: "sleep 30" }));
  const manager = createProcessManager(defs, { stopTimeoutMs: 100 });
  const t = await testRender(
    <App
      config={{ name: "Signals", services: defs }}
      manager={manager}
      onQuit={() => {
        throw new Error("crew must not quit");
      }}
    />,
    { width: 90, height: 24, exitOnCtrlC: false },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await manager.start("api");
    });
    await t.renderOnce();
    await act(async () => {
      await t.mockMouse.click(40, 9);
      t.mockInput.pressCtrlC();
      await waitFor(() => manager.getSnapshot()[0]!.state !== "running");
    });
    expect(manager.getSnapshot()[1]!.state).toBe("running");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
