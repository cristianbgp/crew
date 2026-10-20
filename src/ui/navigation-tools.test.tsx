import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { createProcessManager } from "../process/manager";
import { clickText, escape } from "../../tests/ui-helpers";
import { waitFor } from "../../tests/helpers";
const services = ["web", "api"].map((id) => ({
  id,
  repo: "demo",
  cwd: process.cwd(),
  command:
    'printf "alpha\\nbeta\\n"; while IFS= read -r line; do printf "%s\\n" "$line"; done',
  autostart: false,
}));
test("F2 searches services and Enter switches back to terminal input", async () => {
  const manager = createProcessManager(services);
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("F2");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Switch service");
    await act(async () => {
      await t.mockInput.typeText("api");
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.renderer.root.findDescendantById("terminal-api")!.focused).toBe(
      true,
    );
    expect(t.captureCharFrame()).not.toContain("Switch service");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("Logs filters output, pauses without stopping the process and resumes at latest", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 50 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 65, height: 20 },
  );
  const history = () => new TextDecoder().decode(manager.history("web"));
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() => history().includes("beta"));
    });
    await clickText(t, "Logs");
    expect(t.captureCharFrame()).toContain("Search output");
    await act(async () => {
      await t.mockInput.typeText("beta");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("beta");
    expect(t.captureCharFrame()).not.toContain("alpha");
    const search = t.renderer.root.findDescendantById("log-search")!;
    await act(async () => {
      await t.mockMouse.click(search.x + 1, search.y);
      t.mockInput.pressKey("a", { ctrl: true });
      t.mockInput.pressBackspace();
    });
    await clickText(t, "Pause");
    await act(async () => {
      manager.write("web", new TextEncoder().encode("new-output\n"));
      await waitFor(() => history().includes("new-output"));
      await Bun.sleep(180);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("new-output");
    await clickText(t, "Resume");
    await act(async () => {
      await Bun.sleep(180);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("new-output");
    await clickText(t, "Latest");
    await act(async () => {
      await Bun.sleep(180);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("new-output");
    expect(manager.getSnapshot()[0]!.state).toBe("running");
    await escape(t);
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
