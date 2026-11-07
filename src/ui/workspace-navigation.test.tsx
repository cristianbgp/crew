import { expect, test } from "bun:test";
import { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { App } from "./App";
import { Sidebar } from "./Sidebar";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ServiceSwitcher, type PaletteItem } from "./ServiceSwitcher";
import { createProcessManager } from "../process/manager";
import type { ServiceSnapshot } from "../process/types";
import { clickText } from "../../tests/ui-helpers";

const services = ["reports", "api", "worker"].map((id) => ({
  id,
  repo: id === "worker" ? "background" : "checkout",
  cwd: process.cwd(),
  command: id === "reports" ? "bun api-reports.ts" : `bun ${id}.ts`,
  autostart: false,
}));
const config = { name: "Checkout workspace", services };

test("service search combines unordered terms across name, group and command", async () => {
  let selected = "";
  const t = await testRender(
    <ServiceSwitcher
      config={config}
      snapshots={[]}
      initialQuery="  CHECKOUT   api.ts  "
      onSelect={(id) => {
        selected = id;
      }}
      onClose={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("1 of 3");
    expect(t.captureCharFrame()).not.toContain("No matches");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("api");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("an exact service name outranks a command substring and Clear restores the list", async () => {
  let selected = "";
  const t = await testRender(
    <ServiceSwitcher
      config={config}
      snapshots={[]}
      initialQuery="api"
      onSelect={(id) => {
        selected = id;
      }}
      onClose={() => {}}
    />,
    { width: 80, height: 24 },
  );
  try {
    await t.renderOnce();
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("api");
    await clickText(t, "Clear");
    expect(t.captureCharFrame()).toContain("3 services");
    expect(t.renderer.root.findDescendantById("service-search")!.focused).toBe(
      true,
    );
    await act(async () => {
      await t.mockInput.typeText("not-a-service");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("No matching services");
    await act(async () => {
      t.mockInput.pressKey("u", { ctrl: true });
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("3 services");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("switcher identifies the current service and readiness failure", async () => {
  let selected = "";
  const snapshot: ServiceSnapshot = {
    id: "worker",
    state: "running",
    readiness: "failed",
    error: "Not ready",
    exitCode: null,
    pid: 123,
    generation: 1,
  };
  const t = await testRender(
    <ServiceSwitcher
      config={config}
      snapshots={[snapshot]}
      selectedId="worker"
      onSelect={(id) => {
        selected = id;
      }}
      onClose={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Current");
    expect(t.captureCharFrame()).toContain("unready");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("worker");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("paging reaches distant results and live list shrink activates the visible result", async () => {
  let selected = "";
  let shrink = () => {};
  let restore = () => {};
  const entries: PaletteItem[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    label: `Action ${i}`,
    detail: `Service ${i}`,
    run: () => {
      selected = String(i);
    },
  }));
  function Palette() {
    const [items, setItems] = useState(entries);
    shrink = () => setItems([entries[0]!]);
    restore = () => setItems(entries);
    return (
      <ServiceSwitcher
        config={config}
        snapshots={[]}
        items={items}
        onSelect={() => {}}
        onClose={() => {}}
      />
    );
  }
  const t = await testRender(<Palette />, { width: 40, height: 12 });
  try {
    await t.renderOnce();
    await act(async () => {
      t.mockInput.pressKey("\x1b[6~");
      t.mockInput.pressEnter();
    });
    expect(Number(selected)).toBeGreaterThan(0);
    await act(async () => {
      t.mockInput.pressKey("END", { ctrl: true });
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Action 29");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("29");
    await act(async () => {
      shrink();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Action 0");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("0");
    await act(async () => {
      restore();
    });
    await t.renderOnce();
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(selected).toBe("0");
    expect(t.captureCharFrame()).toContain("Close · Esc");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("Commands puts service actions first and searches them by group and service", async () => {
  const defs = [
    ...services,
    ...Array.from({ length: 20 }, (_, i) => ({
      ...services[0]!,
      id: `extra-${i}`,
    })),
  ];
  const manager = createProcessManager(defs);
  let edited = "";
  const t = await testRender(
    <KeyboardShortcuts onQuit={() => {}}>
      <App
        config={{ ...config, services: defs }}
        manager={manager}
        onQuit={() => {}}
        initialPreferences={{ selected: "api", collapsed: [] }}
        onEdit={(id) => {
          edited = id;
        }}
      />
    </KeyboardShortcuts>,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("k", { ctrl: true });
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Start service");
    await act(async () => {
      await t.mockInput.typeText("edit checkout api");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Edit service");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(edited).toBe("api");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("sidebar preserves the current row in collapsed groups and surfaces hidden failures", async () => {
  const defs = services.slice(1);
  const snapshots: ServiceSnapshot[] = [
    {
      id: "api",
      state: "running",
      readiness: "ready",
      error: null,
      exitCode: null,
      pid: 1,
      generation: 1,
    },
    {
      id: "worker",
      state: "error",
      error: "failed",
      exitCode: 1,
      pid: null,
      generation: 1,
    },
  ];
  const t = await testRender(
    <Sidebar
      config={{ ...config, services: defs }}
      snapshots={snapshots}
      selected="api"
      collapsed={new Set(["checkout", "background"])}
      onSelect={() => {}}
      onAdd={() => {}}
      onGroup={() => {}}
    />,
    { width: 80, height: 24 },
  );
  try {
    await t.renderOnce();
    const frame = t.captureCharFrame();
    expect(frame).toContain("1/2 running");
    expect(frame).toContain("1 issue");
    expect(frame).toContain("api");
    expect(frame).toContain("!1");
    expect(t.renderer.root.findDescendantById("service-row-api")).toBeDefined();
    expect(
      t.renderer.root.findDescendantById("service-row-worker"),
    ).toBeUndefined();
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("compact service drawer covers live output and switching reveals a distant collapsed group", async () => {
  const defs = [
    ...Array.from({ length: 20 }, (_, i) => ({
      ...services[0]!,
      id: `service-${i}`,
      repo: `group-${i}`,
    })),
    services[1]!,
  ];
  const manager = createProcessManager(defs);
  const t = await testRender(
    <App
      config={{ ...config, services: defs }}
      manager={manager}
      onQuit={() => {}}
      initialPreferences={{ selected: "service-0", collapsed: ["checkout"] }}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "Services");
    const sidebar = t.renderer.root.findDescendantById("crew-sidebar")!;
    expect(sidebar.width).toBe(40);
    expect(t.captureCharFrame()).toContain("Close services");
    await act(async () => {
      t.mockInput.pressEscape();
      t.mockInput.pressKey("F2");
    });
    await t.renderOnce();
    await act(async () => {
      await t.mockInput.typeText("api");
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    await clickText(t, "Services");
    await t.renderOnce();
    await t.renderOnce();
    const row = t.renderer.root.findDescendantById("service-row-api")!;
    expect(row).toBeDefined();
    expect(t.captureCharFrame()).toContain("▾ checkout");
    expect(row.y).toBeGreaterThanOrEqual(0);
    expect(row.y).toBeLessThan(11);
    expect(t.captureCharFrame()).toContain("▎");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("shrinking the terminal reveals the selected service after the new layout", async () => {
  const defs = Array.from({ length: 30 }, (_, i) => ({
    ...services[0]!,
    id: `service-${i}`,
  }));
  const t = await testRender(
    <Sidebar
      config={{ ...config, services: defs }}
      snapshots={[]}
      selected="service-25"
      onSelect={() => {}}
      onAdd={() => {}}
    />,
    { width: 80, height: 40 },
  );
  try {
    await t.renderOnce();
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("service-25");
    await act(async () => {
      t.resize(80, 12);
    });
    await t.renderOnce();
    await t.renderOnce();
    await t.renderOnce();
    const row = t.renderer.root.findDescendantById("service-row-service-25")!;
    expect(row.y).toBeGreaterThanOrEqual(0);
    expect(row.y).toBeLessThan(11);
    expect(t.captureCharFrame()).toContain("service-25");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
