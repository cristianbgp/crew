import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { rgbToHex, type TextRenderable } from "@opentui/core";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";
import { LogInspector } from "./LogInspector";
import { ThemeProvider, themes } from "./theme";
import { clickText } from "../../tests/ui-helpers";

for (const appearance of ["light", "dark"] as const) {
  test(`log search reveals distant and horizontally clipped matches in ${appearance} mode`, async () => {
    const lines = [
      "first TOKEN context",
      ...Array.from({ length: 40 }, (_, i) => `context ${i}`),
      `${"界".repeat(50)} last token context`,
    ];
    const manager = createProcessManager([
      {
        id: "web",
        repo: "demo",
        cwd: process.cwd(),
        command: `printf '${lines.join("\\n")}\\n'`,
        autostart: false,
      },
    ]);
    await manager.start("web");
    await waitFor(() =>
      new TextDecoder()
        .decode(manager.history("web"))
        .includes("last token context"),
    );
    const t = await testRender(
      <ThemeProvider preference={appearance}>
        <LogInspector id="web" manager={manager} onClose={() => {}} />
      </ThemeProvider>,
      { width: 40, height: 12 },
    );
    try {
      await act(async () => {
        await t.mockInput.typeText("token");
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("first TOKEN context");
      expect(t.captureCharFrame()).toContain("1 of 2");
      await act(async () => {
        t.mockInput.pressEnter();
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("last token context");
      expect(t.captureCharFrame()).toContain("2 of 2");
      const output = t.renderer.root.findDescendantById(
        "log-output",
      ) as TextRenderable;
      const highlights = output.chunks.filter(
        (chunk) => chunk.text.toLowerCase() === "token",
      );
      expect(highlights).toHaveLength(2);
      expect(rgbToHex(highlights[0]!.bg!)).toBe(themes[appearance].focus);
      expect(rgbToHex(highlights[1]!.bg!)).toBe(themes[appearance].accent);
      expect(rgbToHex(highlights[1]!.fg!)).toBe(themes[appearance].bg);
      await act(async () => {
        t.mockInput.pressKey("a", { ctrl: true });
        await t.mockInput.typeText("missing");
      });
      await t.renderOnce();
      expect(t.captureCharFrame()).toContain("No matches.");
    } finally {
      await act(async () => {
        await manager.shutdown();
        await t.dispose();
      });
    }
  });
}

async function logFixture() {
  const lines = [
    "before",
    "ERROR one",
    "after",
    ...Array.from({ length: 12 }, (_, i) => `unrelated ${i}`),
    "before second",
    "ERROR two",
    "after second",
  ];
  const manager = createProcessManager(
    [
      {
        id: "web",
        repo: "demo",
        cwd: process.cwd(),
        command: `printf '${lines.join("\\n")}\\n'; while IFS= read -r line; do printf '%s\\n' "$line"; done`,
        autostart: false,
      },
    ],
    { stopTimeoutMs: 50 },
  );
  await manager.start("web");
  await waitFor(() =>
    new TextDecoder().decode(manager.history("web")).includes("after second"),
  );
  const t = await testRender(
    <LogInspector id="web" manager={manager} onClose={() => {}} />,
    { width: 80, height: 24 },
  );
  const dispose = async () => {
    await act(async () => {
      await manager.shutdown();
      await t.dispose();
    });
  };
  return { manager, t, dispose };
}

test("log results hide unrelated lines and offer full output without losing the query", async () => {
  const { t, dispose } = await logFixture();
  try {
    await act(async () => {
      await t.mockInput.typeText("error");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Matches");
    expect(t.captureCharFrame()).not.toContain("unrelated 5");
    expect(t.captureCharFrame()).toContain("before");
    await clickText(t, "Reveal");
    expect(t.captureCharFrame()).toContain("unrelated 5");
    expect(t.captureCharFrame()).toContain("1 of 2");
    await clickText(t, "Matches");
    expect(t.captureCharFrame()).not.toContain("unrelated 5");
  } finally {
    await dispose();
  }
});

test("paused search shows arriving output and Resume preserves its query", async () => {
  const { t, manager, dispose } = await logFixture();
  try {
    await act(async () => {
      await t.mockInput.typeText("ERROR");
    });
    await t.renderOnce();
    await act(async () => {
      manager.write("web", new TextEncoder().encode("ERROR fresh\n"));
      await waitFor(() =>
        new TextDecoder()
          .decode(manager.history("web"))
          .includes("ERROR fresh"),
      );
      await Bun.sleep(200);
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("new output");
    expect(t.captureCharFrame()).not.toContain("ERROR fresh");
    await clickText(t, "Refresh");
    const output = t.renderer.root.findDescendantById(
      "log-output",
    ) as TextRenderable;
    expect(output.chunks.map((chunk) => chunk.text).join("")).toContain(
      "ERROR fresh",
    );
    expect(t.captureCharFrame()).toContain("paused");
    await clickText(t, "Resume");
    const input = t.renderer.root.findDescendantById(
      "log-search",
    ) as unknown as { value: string };
    expect(input.value).toBe("ERROR");
    expect(t.captureCharFrame()).toContain("live");
    await act(async () => {
      t.renderer.root.findDescendantById("log-search")!.focus();
      t.mockInput.pressKey("a", { ctrl: true });
      t.mockInput.pressBackspace();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("following");
    expect(input.value).toBe("");
  } finally {
    await dispose();
  }
});

test("no-results state provides recovery and clearing resumes output", async () => {
  const { t, dispose } = await logFixture();
  try {
    await act(async () => {
      await t.mockInput.typeText("missing");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("No matches.");
    expect(t.captureCharFrame()).toContain("Try a shorter search");
    expect(t.captureCharFrame()).not.toContain("ERROR one");
    await clickText(t, "Clear");
    expect(t.captureCharFrame()).toContain("following");
    expect(t.captureCharFrame()).not.toContain("No matches.");
  } finally {
    await dispose();
  }
});

test("navigation wraps from the visible active match after retained results shrink", async () => {
  const manager = createProcessManager([]);
  let retained = "TOKEN 1\nTOKEN 2\nTOKEN 3\nTOKEN 4\nTOKEN 5";
  const snapshotManager = {
    ...manager,
    history: () => new TextEncoder().encode(retained),
  };
  const t = await testRender(
    <LogInspector id="web" manager={snapshotManager} onClose={() => {}} />,
    { width: 80, height: 24 },
  );
  try {
    await act(async () => {
      await t.mockInput.typeText("token");
    });
    for (let index = 0; index < 4; index++) {
      await act(async () => {
        t.mockInput.pressEnter();
      });
      await t.renderOnce();
    }
    expect(t.captureCharFrame()).toContain("5 of 5");
    retained = "TOKEN 3\nTOKEN 4\nTOKEN 5";
    await clickText(t, "Resume");
    expect(t.captureCharFrame()).toContain("3 of 3");
    await clickText(t, "Next");
    expect(t.captureCharFrame()).toContain("1 of 3");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("context choices and reveal preserve the selected occurrence and search snapshot", async () => {
  const { t, dispose } = await logFixture();
  try {
    await act(async () => {
      await t.mockInput.typeText("error");
    });
    await t.renderOnce();
    await act(async () => {
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("2 of 2");
    expect(t.captureCharFrame()).toContain("Context 3");
    await clickText(t, "Context 3");
    expect(t.captureCharFrame()).toContain("Context 5");
    expect(t.captureCharFrame()).toContain("2 of 2");
    await clickText(t, "Reveal");
    expect(t.captureCharFrame()).toContain("All output");
    expect(t.captureCharFrame()).toContain("2 of 2");
    expect(t.captureCharFrame()).toContain("paused");
    const input = t.renderer.root.findDescendantById(
      "log-search",
    ) as unknown as { value: string };
    expect(input.value).toBe("error");
    await clickText(t, "Matches");
    expect(t.captureCharFrame()).toContain("Context 5");
    expect(t.captureCharFrame()).toContain("2 of 2");
    expect(t.captureCharFrame()).not.toContain("unrelated 5");
  } finally {
    await dispose();
  }
});

test("Reveal keeps line numbers and leading context when the match already fits", async () => {
  const manager = createProcessManager([]);
  const snapshotManager = {
    ...manager,
    history: () =>
      new TextEncoder().encode(
        "request started\n2026-11-07 ERROR database connection timeout\nrequest failed\n" +
          "x".repeat(160),
      ),
  };
  const t = await testRender(
    <LogInspector id="api" manager={snapshotManager} onClose={() => {}} />,
    { width: 80, height: 24 },
  );
  try {
    await act(async () => {
      await t.mockInput.typeText("timeout");
    });
    await t.renderOnce();
    await clickText(t, "Reveal");
    expect(t.captureCharFrame()).toContain(
      "2  2026-11-07 ERROR database connection timeout",
    );
    expect(t.captureCharFrame()).toContain("1  request started");
    expect(t.captureCharFrame()).toContain("1 of 1");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("Reveal scrolls to a distant selected match after the full list is laid out", async () => {
  const manager = createProcessManager([]);
  const lines = Array.from({ length: 70 }, (_, index) =>
    index === 5
      ? "TOKEN near"
      : index === 60
        ? "TOKEN far"
        : `context ${index}`,
  );
  const snapshotManager = {
    ...manager,
    history: () => new TextEncoder().encode(lines.join("\n")),
  };
  const t = await testRender(
    <LogInspector id="api" manager={snapshotManager} onClose={() => {}} />,
    { width: 80, height: 24 },
  );
  try {
    await act(async () => {
      await t.mockInput.typeText("token");
    });
    await t.renderOnce();
    await act(async () => {
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("2 of 2");
    await clickText(t, "Reveal");
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("61  TOKEN far");
    expect(t.captureCharFrame()).toContain("2 of 2");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
