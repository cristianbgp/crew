import { test, expect } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfig } from "../config/store";
import { createProcessManager } from "../process/manager";
import { applyServiceChange } from "./edit-service";
import { waitFor } from "../../tests/helpers";
test("editing active service saves without restart; restart uses new command; removal cleans up", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-edit-"));
  const service = {
    id: "web",
    cwd: dir,
    repo: "p",
    command: "printf FIRST; sleep 30",
    autostart: true,
  };
  const manager = createProcessManager([service], { stopTimeoutMs: 100 });
  try {
    let d = await createConfig(join(dir, "crew.toml"), {
      name: "p",
      services: [service],
    });
    await manager.start("web");
    const pid = manager.getSnapshot()[0]!.pid;
    d = await applyServiceChange(
      d,
      {
        type: "update",
        serviceId: "web",
        service: { ...service, command: "printf SECOND; sleep 30" },
      },
      manager,
    );
    expect(manager.getSnapshot()[0]!.pid).toBe(pid);
    await manager.restart("web");
    await waitFor(() =>
      new TextDecoder().decode(manager.history("web")).includes("SECOND"),
    );
    d = await applyServiceChange(
      d,
      { type: "remove", serviceId: "web" },
      manager,
    );
    expect(d.config.services).toHaveLength(0);
    expect(manager.getSnapshot()).toHaveLength(0);
  } finally {
    await manager.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});
test("conflicting config does not change running definitions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-edit-"));
  const manager = createProcessManager([]);
  try {
    const path = join(dir, "crew.toml");
    const d = await createConfig(path, { name: "p", services: [] });
    await writeFile(path, d.text + "# external\n");
    await expect(
      applyServiceChange(
        d,
        {
          type: "add",
          serviceId: "x",
          service: {
            id: "x",
            cwd: dir,
            repo: "p",
            command: "sleep 30",
            autostart: true,
          },
        },
        manager,
      ),
    ).rejects.toThrow("changed");
    expect(manager.getSnapshot()).toHaveLength(0);
    expect(await readFile(path, "utf8")).toContain("# external");
  } finally {
    await manager.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});
test("a stop failure cannot commit a removal or invalidate the current document", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-remove-"));
  const service = {
    id: "web",
    cwd: dir,
    repo: "p",
    command: "sleep 30",
    autostart: true,
  };
  const manager = createProcessManager([service], { stopTimeoutMs: 100 });
  try {
    const doc = await createConfig(join(dir, "crew.toml"), {
      name: "p",
      services: [service],
    });
    await manager.start("web");
    // Fault injection at the OS-signaling boundary; the file and real process remain real.
    const failing = {
      ...manager,
      stop: async () => {
        throw new Error("Signal denied");
      },
    };
    await expect(
      applyServiceChange(doc, { type: "remove", serviceId: "web" }, failing),
    ).rejects.toThrow("Signal denied");
    expect(await readFile(doc.path, "utf8")).toBe(doc.text);
    expect(manager.getSnapshot()[0]!.state).toBe("running");
  } finally {
    await manager.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});
