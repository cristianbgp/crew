import { expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { ServiceSwitcher } from "./ServiceSwitcher";
import { ThemeProvider } from "./theme";
import { clickText } from "../../tests/ui-helpers";

for (const appearance of ["light", "dark"] as const) {
  test(`command palette footer and search stay separated in ${appearance} mode`, async () => {
    let closed = false;
    const t = await testRender(
      <ThemeProvider preference={appearance}>
        <ServiceSwitcher
          config={{ name: "demo", services: [] }}
          snapshots={[]}
          onSelect={() => {}}
          onClose={() => {
            closed = true;
          }}
          initialQuery="group ajp-jwork-core-api"
          items={["Start", "Stop", "Restart"].map((action) => ({
            id: action,
            label: `${action} group`,
            detail: "ajp-jwork-core-api",
            run: () => {},
          }))}
        />
      </ThemeProvider>,
      { width: 90, height: 28 },
    );
    try {
      await t.renderOnce();
      const rows = t.captureCharFrame().split("\n");
      const footer = rows.find((line) => line.includes("↑↓ Choose"))!;
      expect(footer ?? "").toContain("Enter Open");
      expect(footer).toContain("Close · Esc");
      expect(footer.indexOf("Close")).toBeGreaterThan(
        footer.indexOf("Enter Open") + 10,
      );
      const searchRow = rows.findIndex((line) =>
        line.includes("group ajp-jwork-core-api"),
      );
      const resultRow = rows.findIndex((line) => line.includes("Start group"));
      expect(resultRow).toBeGreaterThan(searchRow + 1);
      await clickText(t, "Close · Esc");
      expect(closed).toBe(true);
    } finally {
      await act(async () => {
        await t.dispose();
      });
    }
  });
}

test("compact command palette keeps footer visible while navigating a long result list", async () => {
  let activated = -1;
  const t = await testRender(
    <ServiceSwitcher
      config={{ name: "demo", services: [] }}
      snapshots={[]}
      onSelect={() => {}}
      onClose={() => {}}
      items={Array.from({ length: 24 }, (_, i) => ({
        id: String(i),
        label: `Action ${i}`,
        detail: `Service ${i}`,
        run: () => {
          activated = i;
        },
      }))}
    />,
    { width: 40, height: 12 },
  );
  try {
    await t.renderOnce();
    await act(async () => {
      for (let i = 0; i < 23; i++) t.mockInput.pressKey("ARROW_DOWN");
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Action 23");
    expect(t.captureCharFrame()).toContain("Close · Esc");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    expect(activated).toBe(23);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
