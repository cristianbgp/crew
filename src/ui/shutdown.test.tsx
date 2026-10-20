import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfig } from "../config/store";
import { createProcessManager } from "../process/manager";
import { CrewRoot } from "./CrewRoot";
import { waitFor } from "../../tests/helpers";
import { clickText, escape } from "../../tests/ui-helpers";
test("quit shows remaining services while shutdown waits for a resistant process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-close-"));
  const defs = [
    {
      id: "worker",
      repo: "p",
      cwd: dir,
      command: "trap '' INT; printf READY; while :; do sleep 1; done",
      autostart: false,
    },
  ];
  const doc = await createConfig(join(dir, "crew.toml"), {
    name: "p",
    services: defs,
  });
  const manager = createProcessManager(defs, { stopTimeoutMs: 350 });
  const t = await testRender(
    <CrewRoot
      initialDocument={doc}
      path={doc.path}
      manager={manager}
      onQuit={() => {
        void manager.shutdown();
      }}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      await manager.start("worker");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("worker")).includes("READY"),
      );
    });
    await act(async () => {
      t.mockInput.pressKey("q", { ctrl: true });
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Stopping services");
    expect(t.captureCharFrame()).toContain("worker");
    await act(async () => {
      await manager.shutdown();
    });
    expect(manager.getSnapshot()[0]!.state).toBe("stopped");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
test("Escape safely cancels removal and restores the terminal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-remove-"));
  const defs = [
    { id: "web", repo: "p", cwd: dir, command: "sleep 30", autostart: false },
  ];
  const doc = await createConfig(join(dir, "crew.toml"), {
    name: "p",
    services: defs,
  });
  const manager = createProcessManager(defs);
  const t = await testRender(
    <CrewRoot
      initialDocument={doc}
      path={doc.path}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "More");
    await clickText(t, "Remove");
    expect(t.renderer.currentFocusedRenderable?.id).toBe("remove-cancel");
    await escape(t);
    expect(t.captureCharFrame()).not.toContain("Remove web?");
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
  } finally {
    await act(async () => {
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
