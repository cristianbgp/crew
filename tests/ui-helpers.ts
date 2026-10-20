import { act } from "react";
import type { testRender } from "@opentui/react/test-utils";
import { expect } from "bun:test";
export async function clickText(
  t: Awaited<ReturnType<typeof testRender>>,
  label: string,
) {
  await t.renderOnce();
  const lines = t.captureCharFrame().split("\n");
  const y = lines.findIndex((l) => l.includes(label));
  expect(y).toBeGreaterThanOrEqual(0);
  await act(async () => {
    await t.mockMouse.click(lines[y]!.indexOf(label) + 1, y);
  });
  await t.renderOnce();
}
export async function escape(t: Awaited<ReturnType<typeof testRender>>) {
  await act(async () => {
    t.mockInput.pressEscape();
    await Bun.sleep(40);
  });
  await t.renderOnce();
}
