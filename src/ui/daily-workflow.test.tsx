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
  command: "printf 'http://localhost:3000/\\n'; cat",
  autostart: false,
}));
test("compact command palette runs group actions and restores terminal input", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 40 });
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
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Commands");
    await act(async () => {
      await t.mockInput.typeText("Start group");
      t.mockInput.pressEnter();
      await waitFor(() =>
        manager.getSnapshot().every((s) => s.state === "running"),
      );
    });
    await t.renderOnce();
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    expect(t.captureCharFrame()).not.toContain("Commands");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
test("URL commands copy and explicitly open detected links without losing terminal focus", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 40 });
  let copied = "",
    opened = "";
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
      clipboard={{
        writeText: async (text) => {
          copied = text;
          return "copied";
        },
      }}
      openExternal={async (url) => {
        opened = url;
      }}
    />,
    { width: 65, height: 15 },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("localhost:3000"),
      );
    });
    expect(opened).toBe("");
    for (const query of ["Copy URL", "Open URL"]) {
      await act(async () => {
        t.mockInput.pressKey("k", { ctrl: true });
      });
      await act(async () => {
        await t.mockInput.typeText(query);
        t.mockInput.pressEnter();
        await Bun.sleep(30);
      });
      await t.renderOnce();
    }
    expect(copied).toBe("http://localhost:3000/");
    expect(opened).toBe(copied);
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    await act(async () => {
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await act(async () => {
      await t.mockInput.typeText("Diagnostics");
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Diagnostics");
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
test("remembered selection and collapsed groups restore and remain shared across drawer mounts", async () => {
  const manager = createProcessManager(services);
  let saved: unknown;
  const t = await testRender(
    <App
      config={{ name: "Demo", services }}
      manager={manager}
      onQuit={() => {}}
      initialPreferences={{ selected: "api", collapsed: ["demo"] }}
      onPreferencesChange={(s) => {
        saved = s;
      }}
    />,
    { width: 100, height: 30 },
  );
  try {
    await t.renderOnce();
    expect(t.renderer.root.findDescendantById("terminal-api")!.focused).toBe(
      true,
    );
    expect(t.captureCharFrame()).toContain("▸ demo");
    await clickText(t, "▸ demo");
    expect(saved).toEqual({ selected: "api", collapsed: [] });
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("palette search stays out of the live service and closing preserves typing", async () => {
  const manager = createProcessManager(services, { stopTimeoutMs: 40 });
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
      await manager.start("web");
    });
    await act(async () => {
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await act(async () => {
      await t.mockInput.typeText("do-not-leak");
    });
    await escape(t);
    expect(new TextDecoder().decode(manager.history("web"))).not.toContain(
      "do-not-leak",
    );
    await act(async () => {
      await t.mockInput.typeText("after-menu");
      t.mockInput.pressEnter();
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes("after-menu"),
      );
    });
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("diagnostics export can be activated with the keyboard at 40 columns", async () => {
  const { DiagnosticsPanel } = await import("./DiagnosticsPanel");
  let exported = false;
  const t = await testRender(
    <DiagnosticsPanel
      text="Process info"
      onExport={async () => {
        exported = true;
        return "/tmp/test.log";
      }}
      onClose={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(exported).toBe(true);
    expect(t.captureCharFrame()).toContain("/tmp/test.log");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("waiting startup can be cancelled from the compact toolbar", async () => {
  const defs = [
    {
      ...services[0]!,
      command: "cat",
      ready: { log: "NEVER", timeoutMs: 30000 },
    },
  ];
  const manager = createProcessManager(defs, { stopTimeoutMs: 40 });
  const t = await testRender(
    <App
      config={{ name: "Demo", services: defs }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "Start");
    await act(async () => {
      await waitFor(() => manager.getSnapshot()[0]!.state === "running");
    });
    await clickText(t, "Cancel start");
    await act(async () => {
      await waitFor(() => manager.getSnapshot()[0]!.state === "stopped");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Start");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});

test("Export logs command displays the file path inside diagnostics", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "crew-export-ui-"));
  const previous = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = directory;
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
    await act(async () => {
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await act(async () => {
      await t.mockInput.typeText("Export logs");
      t.mockInput.pressEnter();
      await Bun.sleep(80);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Exported:");
  } finally {
    if (previous === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previous;
    await act(async () => {
      await t.dispose();
    });
    await rm(directory, { recursive: true, force: true });
  }
});
