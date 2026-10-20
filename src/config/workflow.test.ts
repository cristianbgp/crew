import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConfig, saveConfig } from "./store";
test("normal service edits retain startup dependencies and readiness", async () => {
  const directory = await mkdtemp(join(tmpdir(), "crew-advanced-"));
  try {
    const doc = await createConfig(join(directory, "crew.toml"), {
      name: "App",
      services: [
        {
          id: "db",
          cwd: directory,
          repo: "app",
          command: "sleep 30",
          autostart: false,
        },
        {
          id: "api",
          cwd: directory,
          repo: "app",
          command: "cat",
          autostart: false,
          dependsOn: ["db"],
          ready: { http: "http://localhost:3000/health", timeoutMs: 5000 },
        },
      ],
    });
    const api = doc.config.services[1]!;
    const saved = await saveConfig(doc, {
      type: "update",
      serviceId: "api",
      service: { ...api, command: "bun dev" },
    });
    expect(saved.config.services[1]!.dependsOn).toEqual(["db"]);
    expect(saved.config.services[1]!.ready).toEqual(api.ready);
    expect(saved.config.services[1]!.command).toBe("bun dev");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
