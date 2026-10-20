import { test, expect } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { ServiceEditor } from "./ServiceEditor";
import { clickText } from "../../tests/ui-helpers";
test("Tab reaches the automatic-start toggle and save actions", async () => {
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
    { width: 65, height: 20 },
  );
  try {
    await act(async () => {
      for (let i = 0; i < 4; i++) t.mockInput.pressTab();
    });
    await t.renderOnce();
    expect(t.renderer.currentFocusedRenderable?.id).toBe("service-autostart");
    await act(async () => {
      t.mockInput.pressEnter();
    });
    await t.renderOnce();
    expect(t.captureCharFrame()).toContain("[ ] Start automatically");
    await act(async () => {
      t.mockInput.pressTab();
      t.mockInput.pressTab();
    });
    expect(t.renderer.currentFocusedRenderable?.id).toBe("service-save");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
test("validation names the missing field and focuses it", async () => {
  const t = await testRender(
    <ServiceEditor
      baseDir={process.cwd()}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await clickText(t, "Save service");
    expect(t.captureCharFrame()).toContain("Enter a service name");
    expect(t.renderer.currentFocusedRenderable?.id).toBe("field-0");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("Tab continues from a control selected with the mouse", async () => {
  const initial = {
    id: "web",
    repo: "p",
    cwd: process.cwd(),
    command: "cat",
    autostart: true,
  };
  const t = await testRender(
    <ServiceEditor
      initial={initial}
      baseDir={process.cwd()}
      onSave={async () => {}}
      onCancel={() => {}}
    />,
    { width: 65, height: 20 },
  );
  try {
    await clickText(t, "Start automatically");
    await act(async () => {
      t.mockInput.pressTab();
    });
    expect(t.renderer.currentFocusedRenderable?.id).toBe("service-find");
    await clickText(t, "Start automatically");
    await act(async () => {
      t.mockInput.pressTab();
    });
    expect(t.renderer.currentFocusedRenderable?.id).toBe("service-find");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});

test("empty setup name validation returns focus to the workspace field", async () => {
  const { SetupWizard } = await import("./SetupWizard");
  const t = await testRender(
    <SetupWizard
      baseDir={process.cwd()}
      onFinish={async () => {}}
      onCancel={() => {}}
    />,
    { width: 40, height: 12 },
  );
  try {
    await act(async () => {
      t.mockInput.pressKey("a", { ctrl: true });
      t.mockInput.pressBackspace();
    });
    await clickText(t, "Save & start");
    expect(t.captureCharFrame()).toContain("Choose a workspace name");
    expect(t.renderer.currentFocusedRenderable?.id).toBe("workspace-name");
  } finally {
    await act(async () => {
      await t.dispose();
    });
  }
});
