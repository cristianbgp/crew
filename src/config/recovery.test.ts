import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfig, saveConfig } from "./store";
import { createProcessManager } from "../process/manager";

test("missing optional directories do not prevent healthy services loading and starting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-recovery-"));
  const defs = [
    { id: "good", repo: "p", cwd: dir, command: "sleep 30", autostart: true },
    {
      id: "missing",
      repo: "p",
      cwd: join(dir, "missing"),
      command: "sleep 30",
      autostart: false,
    },
  ];
  let manager: ReturnType<typeof createProcessManager> | undefined;
  try {
    const doc = await createConfig(join(dir, "crew.toml"), {
      name: "p",
      services: defs,
    });
    manager = createProcessManager(doc.config.services, { stopTimeoutMs: 50 });
    expect(manager.getSnapshot()[1]!.state).toBe("error");
    expect(manager.getSnapshot()[1]!.error).toContain("Directory");
    await manager.start("good");
    await manager.start("missing");
    expect(manager.getSnapshot()[0]!.state).toBe("running");
    expect(manager.getSnapshot()[1]!.state).toBe("error");
    expect(manager.getSnapshot()[1]!.error).toContain("Directory");
  } finally {
    await manager?.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});

test("an abandoned lock artifact does not permanently block saving", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-lock-"));
  try {
    const path = join(dir, "crew.toml");
    const doc = await createConfig(path, { name: "p", services: [] });
    await writeFile(path + ".lock", "");
    const saved = await saveConfig(doc, {
      type: "add",
      serviceId: "web",
      service: {
        id: "web",
        repo: "p",
        cwd: dir,
        command: "sleep 30",
        autostart: false,
      },
    });
    expect(saved.config.services[0]!.id).toBe("web");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a live kernel lock cannot be stolen and can be acquired after release", async () => {
  const { acquireConfigLock } = await import("./lock");
  const dir = await mkdtemp(join(tmpdir(), "crew-live-lock-"));
  let release: (() => Promise<void>) | undefined;
  try {
    const path = join(dir, "crew.toml");
    release = await acquireConfigLock(path);
    await expect(acquireConfigLock(path)).rejects.toThrow("another crew");
    await release();
    release = undefined;
    const next = await acquireConfigLock(path);
    await next();
  } finally {
    await release?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test("kernel ownership releases when the lock holder is killed", async () => {
  const { resolve } = await import("node:path");
  const dir = await mkdtemp(join(tmpdir(), "crew-crash-lock-"));
  const path = join(dir, "crew.toml");
  let child: Bun.Subprocess | undefined;
  try {
    const modulePath = resolve("src/config/lock.ts");
    child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `const {acquireConfigLock}=await import(${JSON.stringify(modulePath)});await acquireConfigLock(${JSON.stringify(path)});process.stdout.write("LOCKED");setInterval(()=>{},60000);`,
      ],
      { stdout: "pipe", stderr: "inherit" },
    );
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("LOCKED");
    reader.releaseLock();
    const { acquireConfigLock } = await import("./lock");
    await expect(acquireConfigLock(path)).rejects.toThrow("another crew");
    child.kill("SIGKILL");
    await child.exited;
    const release = await acquireConfigLock(path);
    await release();
  } finally {
    if (child?.exitCode === null) {
      child.kill("SIGKILL");
      await child.exited;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
