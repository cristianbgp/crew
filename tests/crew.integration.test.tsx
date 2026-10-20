import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CrewRoot } from "../src/ui/CrewRoot";
import { createProcessManager } from "../src/process/manager";
import { loadConfig } from "../src/config/store";
import { waitFor } from "./helpers";
test("first-run wizard adds a service in another repo, saves, starts, and quits cleanly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-e2e-"));
  await mkdir(join(dir, "workspace"));
  await mkdir(join(dir, "other repo"));
  const path = join(dir, "workspace/crew.toml");
  const manager = createProcessManager([], { stopTimeoutMs: 100 });
  const t = await testRender(
    <CrewRoot
      initialDocument={null}
      path={path}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 110, height: 34, exitOnCtrlC: false },
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
    await click("+ Add service");
    for (const [i, value] of [
      "worker",
      "other",
      "../other repo",
      "printf READY; sleep 30",
    ].entries()) {
      const field = t.renderer.root.findDescendantById(`field-${i}`)!;
      await act(async () => {
        await t.mockMouse.click(field.x + 1, field.y);
        t.mockInput.pressKey("a", { ctrl: true });
        await t.mockInput.pasteBracketedText(value);
      });
    }
    await click("Save service");
    expect(t.captureCharFrame()).toContain("worker");
    await click("Save & start");
    await act(async () => {
      await waitFor(
        () =>
          manager.getSnapshot().length === 1 &&
          new TextDecoder().decode(manager.history("worker")).includes("READY"),
      );
    });
    await t.renderOnce();
    const doc = (await loadConfig(path))!;
    expect(doc.config.services[0]!.cwd).toBe(join(dir, "other repo"));
    expect(t.captureCharFrame()).toContain("READY");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
test("script discovery is a click-to-select action, without executing package scripts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-discover-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { dev: "printf NEVER_EXECUTED" } }),
  );
  const manager = createProcessManager([]);
  const t = await testRender(
    <CrewRoot
      initialDocument={null}
      path={join(dir, "crew.toml")}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 110, height: 38 },
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
    await click("+ Add service");
    await click("Find scripts");
    await act(async () => {
      await Bun.sleep(30);
    });
    await t.renderOnce();
    await click("dev");
    expect(t.captureCharFrame()).toContain("bun run 'dev'");
    expect(manager.getSnapshot()).toHaveLength(0);
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
