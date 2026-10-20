import { test, expect } from "bun:test";
import { createWorkspace } from "./workspace";
const services = [
  { id: "web", repo: "one", cwd: "/", command: "x", autostart: true },
  { id: "api", repo: "two", cwd: "/", command: "x", autostart: true },
];
test("selection, collapse and dialog focus are independent of service state", () => {
  const w = createWorkspace(services);
  expect(w.selected).toBe("web");
  w.select("api");
  expect(w.selected).toBe("api");
  w.toggleRepo("two");
  expect(w.collapsed.has("two")).toBe(true);
  w.setFocus("dialog");
  expect(w.canSendInput("api")).toBe(false);
  w.setFocus("terminal");
  expect(w.canSendInput("web")).toBe(false);
  expect(w.canSendInput("api")).toBe(true);
  w.reconcile([services[0]!]);
  expect(w.selected).toBe("web");
});
