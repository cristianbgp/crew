import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import type { BoxRenderable, EmbeddedTerminalRenderable } from "@opentui/core";
import { App } from "./App";
import { ThemeProvider } from "./theme";
import { createProcessManager } from "../process/manager";
import { clickText } from "../../tests/ui-helpers";
const definitions = [
  {
    id: "web",
    repo: "product",
    cwd: process.cwd(),
    command: "cat",
    autostart: false,
  },
];
test("roomy header keeps status beside the title and separates toolbar from opaque output", async () => {
  const manager = createProcessManager(definitions);
  const t = await testRender(
    <ThemeProvider preference="light">
      <App
        config={{ name: "Playground", services: definitions }}
        manager={manager}
        onQuit={() => {}}
      />
    </ThemeProvider>,
    { width: 120, height: 30 },
  );
  try {
    await t.renderOnce();
    const title = t.renderer.root.findDescendantById("crew-service-title")!;
    const status = t.renderer.root.findDescendantById("crew-service-status")!;
    const controls = t.renderer.root.findDescendantById(
      "crew-service-controls",
    )!;
    const terminal = t.renderer.root.findDescendantById(
      "terminal-web",
    ) as EmbeddedTerminalRenderable;
    expect(status.x - title.x).toBeLessThan(25);
    expect(terminal.y).toBeGreaterThanOrEqual(controls.y + 2);
    expect(terminal.transparentBackground).toBe(false);
    expect(t.captureCharFrame()).not.toContain("crew / workspace");
    expect(t.captureCharFrame()).toContain("▎");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("Open appears for URLs emitted after startup and opens only on an explicit click", async () => {
  const defs = [
    {
      ...definitions[0]!,
      command: "sleep 0.25; printf 'Local: http://127.0.0.1:3000/\\n'; cat",
    },
  ];
  const manager = createProcessManager(defs, { stopTimeoutMs: 40 });
  let opened = "";
  const t = await testRender(
    <App
      config={{ name: "Playground", services: defs }}
      manager={manager}
      onQuit={() => {}}
      openExternal={async (url) => {
        opened = url;
      }}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      await manager.start("web");
    });
    await act(async () => {
      await Bun.sleep(500);
    });
    await t.renderOnce();
    expect(opened).toBe("");
    await clickText(t, "Open ↗");
    expect(opened).toBe("http://127.0.0.1:3000/");
    expect(t.renderer.root.findDescendantById("terminal-web")!.focused).toBe(
      true,
    );
    const button = t.renderer.root.findDescendantById("crew-open-url")!;
    expect(button.x + button.width).toBeLessThanOrEqual(40);
    expect(
      t.renderer.root.findDescendantById("terminal-web")!.height,
    ).toBeGreaterThanOrEqual(9);
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
test("selected service marker stays visible when focus moves to another row", async () => {
  const defs = [...definitions, { ...definitions[0]!, id: "api" }];
  const manager = createProcessManager(defs);
  const t = await testRender(
    <App
      config={{ name: "Playground", services: defs }}
      manager={manager}
      onQuit={() => {}}
    />,
    { width: 100, height: 30 },
  );
  try {
    await t.renderOnce();
    const selected = t.renderer.root.findDescendantById(
      "service-row-web",
    ) as BoxRenderable;
    const other = t.renderer.root.findDescendantById(
      "service-row-api",
    ) as BoxRenderable;
    const selectedColor = selected.backgroundColor.toString();
    await act(async () => {
      other.focus();
    });
    expect(other.backgroundColor.toString()).not.toBe(selectedColor);
    await t.renderOnce();
    expect(
      t
        .captureCharFrame()
        .split("\n")
        .find((line) => line.includes("▎")),
    ).toContain("web");
    expect(t.captureCharFrame()).toContain("▎");
    expect(t.renderer.root.findDescendantById("terminal-web")!.visible).toBe(
      true,
    );
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("Open waits for a complete URL instead of retaining a partial port", async () => {
  const { waitFor } = await import("../../tests/helpers");
  const defs = [
    {
      ...definitions[0]!,
      command:
        "printf 'Local: http://localhost:30'; sleep 0.5; printf '00/\\n'; cat",
    },
  ];
  const manager = createProcessManager(defs, { stopTimeoutMs: 40 });
  let opened = "";
  const t = await testRender(
    <App
      config={{ name: "Demo", services: defs }}
      manager={manager}
      onQuit={() => {}}
      openExternal={async (url) => {
        opened = url;
      }}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      await manager.start("web");
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes(":30"),
      );
      await Bun.sleep(190);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).not.toContain("Open ↗");
    await act(async () => {
      await waitFor(() =>
        new TextDecoder().decode(manager.history("web")).includes(":3000/"),
      );
      await Bun.sleep(200);
    });
    await clickText(t, "Open ↗");
    expect(opened).toBe("http://localhost:3000/");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
test("removing the selected previously started service keeps the workspace usable", async () => {
  const { useState } = await import("react");
  const manager = createProcessManager(definitions, { stopTimeoutMs: 40 });
  let remove = () => {};
  function Workspace() {
    const [defs, setDefs] = useState(definitions);
    remove = () => {
      manager.updateDefinitions([]);
      setDefs([]);
    };
    return (
      <App
        config={{ name: "Demo", services: defs }}
        manager={manager}
        onQuit={() => {}}
      />
    );
  }
  const t = await testRender(<Workspace />, { width: 65, height: 15 });
  try {
    await act(async () => {
      await manager.start("web");
    });
    await t.renderOnce();
    await act(async () => {
      await manager.stop("web");
      remove();
      await Bun.sleep(40);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Your services, one workspace.");
    expect(t.captureCharFrame()).toContain("Add service");
  } finally {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  }
});
