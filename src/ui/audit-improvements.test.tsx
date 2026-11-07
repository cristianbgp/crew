import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { ServiceEditor } from "./ServiceEditor";
import { SetupWizard } from "./SetupWizard";
import { createProcessManager } from "../process/manager";
import { clickText } from "../../tests/ui-helpers";
import { waitFor } from "../../tests/helpers";

const service = {
  id: "web",
  repo: "demo",
  cwd: process.cwd(),
  command: "printf READY; cat",
  autostart: false,
};

test("a stopped service explains its empty terminal and Start preserves the terminal", async () => {
  const manager = createProcessManager([service], { stopTimeoutMs: 50 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services: [service] }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    const terminal = t.renderer.root.findDescendantById("terminal-web");
    expect(t.captureCharFrame()).toContain("Start web to run its command.");
    await clickText(t, "Start service");
    await act(async () => {
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("READY"),
      );
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Start web to run its command.");
    expect(t.renderer.root.findDescendantById("terminal-web")).toBe(terminal);
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("stopped services retain their output instead of showing empty guidance", async () => {
  const manager = createProcessManager([service], { stopTimeoutMs: 50 });
  await manager.start("web");
  await waitFor(() =>
    new TextDecoder().decode(manager.history("web")).includes("READY"),
  );
  await manager.stop("web");
  const t = await testRender(
    <App
      config={{ name: "Demo", services: [service] }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 80, height: 24 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("READY");
    expect(t.captureCharFrame()).not.toContain("Start web to run its command.");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("service validation is shown next to the field that needs correction", async () => {
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
    { width: 80, height: 24 },
  );
  try {
    await clickText(t, "Save service");
    const lines = t.captureCharFrame().split("\n");
    const field = lines.findIndex((line) => line.includes("Service name"));
    const error = lines.findIndex((line) =>
      line.includes("Enter a service name."),
    );
    const next = lines.findIndex((line) => line.includes("Repo / group"));
    expect(error).toBeGreaterThan(field);
    expect(error).toBeLessThan(next);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("setup describes creation accurately when there are no services to start", async () => {
  let saved = false;
  const t = await testRender(
    <SetupWizard
      baseDir={process.cwd()}
      onFinish={async (config) => {
        saved = config.services.length === 0;
      }}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Create workspace");
    await clickText(t, "Create workspace");
    expect(saved).toBe(true);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
