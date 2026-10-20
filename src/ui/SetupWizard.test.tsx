import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { waitFor } from "../../tests/helpers";
import { SetupWizard } from "./SetupWizard";
test("setup presents explicit save and cancellation controls without executing anything", async () => {
  let cancelled = false;
  const t = await testRender(
    <SetupWizard
      baseDir={process.cwd()}
      onFinish={async () => {}}
      onCancel={() => {
        cancelled = true;
      }}
    />,
    { width: 90, height: 32 },
  );
  try {
    await t.renderOnce();
    const frame = t.captureCharFrame();
    expect(frame).toContain("Create your workspace");
    expect(frame).toContain("Add service");
    expect(frame).toContain("Save & start");
    const lines = frame.split("\n");
    const y = lines.findIndex((l) => l.includes("Cancel"));
    await act(async () => {
      await t.mockMouse.click(lines[y]!.indexOf("Cancel") + 1, y);
    });
    expect(cancelled).toBe(true);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("first-run actions remain accessible at 65 by 15 and Escape cancels", async () => {
  let cancelled = false;
  const t = await testRender(
    <box width="100%" height="100%" alignItems="center" justifyContent="center">
      <SetupWizard
        baseDir={process.cwd()}
        onFinish={async () => {}}
        onCancel={() => {
          cancelled = true;
        }}
      />
    </box>,
    { width: 65, height: 15 },
  );
  try {
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("Save & start");
    expect(t.captureCharFrame()).toContain("Cancel");
    await act(async () => {
      t.mockInput.pressEscape();
      await waitFor(() => cancelled);
    });
    expect(cancelled).toBe(true);
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
