import { expect, test } from "bun:test";
import { stat, access } from "node:fs/promises";
import { dirname } from "node:path";
import { createDemoWorkspace } from "./workspace";
import { loadConfig } from "../config/store";
import { createProcessManager } from "../process/manager";
import { waitFor } from "../../tests/helpers";

test("demo is writable, private, session-local and uses internal runtime modes", async () => {
  const demo = await createDemoWorkspace();
  const directory = dirname(demo.path);
  try {
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    const doc = (await loadConfig(demo.path))!;
    expect(doc.config.name).toBe("Playground");
    expect(doc.config.services.length).toBe(4);
    for (const service of doc.config.services.slice(0, 3)) {
      expect(service.cwd).toBe(directory);
      expect(service.command).toContain("--crew-internal");
      expect(service.command).not.toContain("tests/fixtures");
    }
  } finally {
    await demo.dispose();
    await demo.dispose();
  }
  expect(
    await access(directory).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("demo servers and interactive worker run through shared entry modes and stop", async () => {
  const demo = await createDemoWorkspace();
  const doc = (await loadConfig(demo.path))!;
  const manager = createProcessManager(doc.config.services, {
    stopTimeoutMs: 100,
  });
  const text = (id: string) => new TextDecoder().decode(manager.history(id));
  try {
    await manager.start("web");
    await waitFor(() => text("web").includes("Local:"));
    const url = /http:\/\/127\.0\.0\.1:\d+/.exec(text("web"))![0];
    expect(await (await fetch(url)).text()).toBe("Hello from crew demo web\n");
    await manager.start("worker");
    await waitFor(() => text("worker").includes("crew demo worker"));
    manager.write("worker", new TextEncoder().encode("demo-worker\n"));
    await waitFor(() => text("worker").includes("ANSWER:demo-worker"));
  } finally {
    await manager.shutdown();
    await demo.dispose();
  }
});

test("failed demo configuration creation removes its temporary directory", async () => {
  let directory = "";
  await expect(
    createDemoWorkspace(async (path) => {
      directory = dirname(path);
      throw new Error("synthetic write failure");
    }),
  ).rejects.toThrow("synthetic write failure");
  expect(directory).not.toBe("");
  expect(
    await access(directory).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});
