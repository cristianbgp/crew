import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { Button } from "./Button";
import { ServiceEditor } from "./ServiceEditor";
import { createProcessManager } from "../process/manager";
import type { BoxRenderable } from "@opentui/core";

async function click(t: Awaited<ReturnType<typeof testRender>>, label: string) {
  await t.renderOnce();
  const lines = t.captureCharFrame().split("\n");
  const y = lines.findIndex((line) => line.includes(label));
  expect(y).toBeGreaterThanOrEqual(0);
  await act(async () => {
    await t.mockMouse.click(lines[y]!.indexOf(label) + 1, y);
  });
  await t.renderOnce();
}
const services = ["web", "api"].map((id) => ({
  id,
  repo: "demo",
  cwd: process.cwd(),
  command: "sleep 30",
  autostart: false,
}));

test("compact service drawer overlays a full-width terminal and restores focus on selection", async () => {
  const manager = createProcessManager(services);
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 65, height: 15 },
  );
  try {
    await t.renderOnce();
    const terminal = t.renderer.root.findDescendantById("terminal-web")!;
    expect(terminal.height).toBeGreaterThanOrEqual(11);
    const width = terminal.width;
    await click(t, "Services");
    expect(terminal.width).toBe(width);
    expect(terminal.focused).toBe(false);
    await click(t, "api");
    expect(t.captureCharFrame()).not.toContain("2 services");
    expect(t.renderer.root.findDescendantById("terminal-api")!.focused).toBe(
      true,
    );
    expect(t.renderer.root.findDescendantById("terminal-api")!.width).toBe(
      width,
    );
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("small service actions stay reachable through More without stealing Escape from the terminal", async () => {
  let edited = "";
  const manager = createProcessManager(services);
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
      onEdit={(id) => {
        edited = id;
      }}
    />,
    { width: 40, height: 12 },
  );
  try {
    await click(t, "More");
    expect(t.captureCharFrame()).toContain("sleep 30");
    await click(t, "Edit");
    expect(edited).toBe("web");
    expect(t.captureCharFrame()).not.toContain("Service actions");
    await click(t, "More");
    await act(async () => {
      t.mockInput.pressEscape();
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Service actions");
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("buttons visibly acknowledge a quick click and disabled buttons do not activate", async () => {
  let presses = 0;
  const t = await testRender(
    <box>
      <Button
        label="Run"
        onPress={() => {
          presses++;
        }}
      />
      <Button
        label="Disabled"
        disabled
        onPress={() => {
          presses++;
        }}
      />
    </box>,
    { width: 40, height: 10 },
  );
  try {
    await t.renderOnce();
    const button = t.renderer.root
      .getChildren()[0]!
      .getChildren()[0] as BoxRenderable;
    const original = button.backgroundColor.toString();
    await act(async () => {
      await t.mockMouse.moveTo(button.x + 1, button.y);
    });
    expect(button.backgroundColor.toString()).not.toBe(original);
    const hovered = button.backgroundColor.toString();
    await click(t, "Run");
    expect(presses).toBe(1);
    expect(button.backgroundColor.toString()).not.toBe(hovered);
    const pressed = button.backgroundColor.toString();
    await act(async () => {
      await Bun.sleep(250);
    });
    expect(button.backgroundColor.toString()).not.toBe(pressed);
    await act(async () => {
      button.blur();
    });
    expect(button.backgroundColor.toString()).toBe(hovered);
    await act(async () => {
      button.focus();
    });
    expect(button.backgroundColor.toString()).not.toBe(hovered);
    await click(t, "Disabled");
    expect(presses).toBe(1);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("service form keeps Save and Cancel reachable at 40 by 12 even with validation feedback", async () => {
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      onSave={async () => {}}
      onCancel={() => {}}
      onReload={async () => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await click(t, "Save service");
    expect(t.captureCharFrame()).toContain("Enter a service name");
    expect(t.captureCharFrame()).toContain("Cancel");
    expect(t.captureCharFrame()).toContain("Reload file");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("restart acknowledges pending work and ignores duplicate clicks until the service is running", async () => {
  const { waitFor } = await import("../../tests/helpers");
  const defs = [
    {
      ...services[0]!,
      command: "trap '' INT; printf READY; while :; do sleep 1; done",
    },
  ];
  const manager = createProcessManager(defs, { stopTimeoutMs: 350 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services: defs }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 65, height: 15 },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("READY"),
      );
    });
    const pid = manager.getSnapshot()[0]!.pid;
    await click(t, "More");
    await click(t, "Restart");
    expect(t.captureCharFrame()).toContain("Restarting…");
    await click(t, "Restarting…");
    await act(async () => {
      await waitFor(
        () =>
          manager.getSnapshot()[0]!.state === "running" &&
          manager.getSnapshot()[0]!.pid !== pid,
      );
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Restarting…");
    expect(t.captureCharFrame()).toContain("Stop");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("small setup shows its focused workspace field before explanatory content", async () => {
  const { SetupWizard } = await import("./SetupWizard");
  const { KeyboardShortcuts } = await import("./KeyboardShortcuts");
  const t = await testRender(
    <KeyboardShortcuts onQuit={() => {}}>
      <SetupWizard
        baseDir={process.cwd()}
        onFinish={async () => {}}
        onCancel={() => {}}
      />
    </KeyboardShortcuts>,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Workspace name");
    expect(t.captureCharFrame()).toContain("+ Add service");
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      await t.mockInput.typeText("My workspace");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("My workspace");
    expect(t.captureCharFrame()).toContain("Save & start");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("small remove confirmation keeps Cancel and Reload reachable without changing the file", async () => {
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createConfig } = await import("../config/store");
  const { CrewRoot } = await import("./CrewRoot");
  const dir = await mkdtemp(join(tmpdir(), "crew-compact-"));
  const doc = await createConfig(join(dir, "crew.toml"), {
    name: "Demo",
    services,
  });
  const manager = createProcessManager(services);
  const t = await testRender(
    <CrewRoot
      initialDocument={doc}
      path={doc.path}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  const original = await readFile(doc.path, "utf8");
  try {
    await click(t, "More");
    await click(t, "Remove");
    expect(t.captureCharFrame()).toContain("Remove service");
    expect(t.captureCharFrame()).toContain("Reload file");
    await click(t, "Cancel");
    expect(t.captureCharFrame()).not.toContain("Remove web?");
    expect(await readFile(doc.path, "utf8")).toBe(original);
  } finally {
    await act(async () => {
      await t.dispose();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
