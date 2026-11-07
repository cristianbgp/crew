import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { ServiceEditor } from "./ServiceEditor";
import { ConfigConflictError } from "../config/store";
import { createProcessManager } from "../process/manager";
import { clickText } from "../../tests/ui-helpers";

const service = {
  id: "web",
  repo: "demo",
  cwd: process.cwd(),
  command: "sleep 30",
  autostart: false,
};

test("More puts actions first and command details are optional", async () => {
  const manager = createProcessManager([service]);
  const t = await testRender(
    <App
      config={{ name: "Demo", services: [service] }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "More");
    const frame = t.captureCharFrame();
    expect(frame).not.toContain("sleep 30");
    expect(frame).toContain("Diagnostics");
    expect(frame.indexOf("Edit")).toBeLessThan(frame.indexOf("Remove"));
    await clickText(t, "Command & directory");
    await act(async () => {
      await Bun.sleep(20);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("sleep 30");
    expect(t.captureCharFrame()).toContain("Close");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("reload appears only after a file conflict and Keep editing preserves unsaved values", async () => {
  let reloads = 0;
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      initial={service}
      onSave={async () => {
        throw new ConfigConflictError();
      }}
      onReload={async () => {
        reloads++;
      }}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Reload file");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("changed group");
    });
    await clickText(t, "Save service");
    expect(t.captureCharFrame()).toContain("Reload file");
    await clickText(t, "Reload file");
    expect(t.captureCharFrame()).toContain("unsaved");
    expect(t.captureCharFrame()).toContain("Keep editing");
    expect(reloads).toBe(0);
    await clickText(t, "Keep editing");
    const group = t.renderer.root.findDescendantById("field-1") as unknown as {
      value: string;
    };
    expect(group.value).toBe("changed group");
    expect(reloads).toBe(0);
    await clickText(t, "Reload file");
    await clickText(t, "Reload and discard");
    expect(reloads).toBe(1);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("ordinary validation failures do not offer configuration reload", async () => {
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      onSave={async () => {}}
      onReload={async () => {}}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "Save service");
    expect(t.captureCharFrame()).toContain("Enter a service name");
    expect(t.captureCharFrame()).not.toContain("Reload file");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("a failed reload keeps recovery available and returns focus to a real control", async () => {
  let invalidFile = true;
  let attempts = 0;
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      initial={service}
      onSave={async () => {
        throw new ConfigConflictError();
      }}
      onReload={async () => {
        attempts++;
        if (invalidFile) throw new Error("Invalid external TOML");
      }}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "Save service");
    await clickText(t, "Reload file");
    await clickText(t, "Reload and discard");
    expect(t.captureCharFrame()).toContain("Invalid external TOML");
    await clickText(t, "Keep editing");
    expect(t.captureCharFrame()).toContain("Reload file");
    expect(t.renderer.currentFocusedRenderable?.id).toBe("service-reload");
    invalidFile = false;
    await clickText(t, "Reload file");
    await clickText(t, "Reload and discard");
    expect(attempts).toBe(2);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
