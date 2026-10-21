import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrewRoot } from "./CrewRoot";
import { createConfig, loadConfig } from "../config/store";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
test("editing command isolates form input and paste; save defers changes until restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-ui-"));
  const service = {
    id: "web",
    repo: "one",
    cwd: dir,
    command: 'while read line; do printf "INPUT:%s\\n" "$line"; done',
    autostart: true,
  };
  const document = await createConfig(join(dir, "crew.toml"), {
    name: "Test",
    services: [service],
  });
  const manager = createProcessManager([service], { stopTimeoutMs: 100 });
  const t = await testRender(
    <CrewRoot
      initialDocument={document}
      path={document.path}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 110, height: 34, exitOnCtrlC: false },
  );
  const clickText = async (text: string) => {
    await t.renderOnce();
    const lines = t.captureCharFrame().split("\n");
    const y = lines.findIndex((l) => l.includes(text));
    expect(y).toBeGreaterThanOrEqual(0);
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf(text) + 1, y);
    });
    await t.renderOnce();
  };
  try {
    await act(async () => {
      await manager.start("web");
    });
    await clickText("More");
    await clickText("Edit");
    expect(t.captureCharFrame()).toContain("Edit service");
    const field = t.renderer.root.findDescendantById("field-3")!;
    const x = field.x + 1,
      y = field.y;
    await act(async () => {
      await t.mockMouse.click(x, y);
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.pasteBracketedText("printf CHANGED; sleep 30");
    });
    expect(new TextDecoder().decode(manager.history("web"))).not.toContain(
      "CHANGED",
    );
    await clickText("Save service");
    await act(async () => {
      await waitFor(() => !t.renderer.root.findDescendantById("service-save"));
    });
    expect((await loadConfig(document.path))!.config.services[0]!.command).toBe(
      "printf CHANGED; sleep 30",
    );
    expect(manager.getSnapshot()[0]!.state).toBe("running");
    await clickText("Restart");
    await act(async () => {
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("CHANGED"),
      );
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("CHANGED");
    expect(await readFile(document.path, "utf8")).toContain("printf CHANGED");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
test("small viewport preserves editor actions and restores terminal focus after cancel", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-small-"));
  const service = {
    id: "web",
    repo: "p",
    cwd: dir,
    command: "sleep 30",
    autostart: true,
  };
  const doc = await createConfig(join(dir, "crew.toml"), {
    name: "p",
    services: [service],
  });
  const manager = createProcessManager([service], { stopTimeoutMs: 100 });
  const t = await testRender(
    <CrewRoot
      initialDocument={doc}
      path={doc.path}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 65, height: 15, exitOnCtrlC: false },
  );
  const click = async (text: string) => {
    await t.renderOnce();
    const lines = t.captureCharFrame().split("\n");
    const y = lines.findLastIndex((l) => l.includes(text));
    expect(y).toBeGreaterThanOrEqual(0);
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf(text) + 1, y);
    });
    await t.renderOnce();
  };
  try {
    await click("More");
    await click("Edit");
    expect(t.captureCharFrame()).toContain("Save service");
    expect(t.captureCharFrame()).toContain("Cancel");
    await click("Cancel");
    const term = t.renderer.root.findDescendantById("terminal-web")!;
    expect(term.focused).toBe(true);
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
