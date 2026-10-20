import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverScripts } from "./discover";
test("discovers scripts without execution and quotes shell characters in names", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-scripts-"));
  try {
    expect(await discoverScripts(dir)).toEqual([]);
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: { dev: "vite", "dev; echo injected": "echo unsafe" },
      }),
    );
    const scripts = await discoverScripts(dir);
    expect(scripts[0]!.command).toBe("bun run 'dev'");
    expect(scripts[1]!.command).toBe("bun run 'dev; echo injected'");
    await writeFile(join(dir, "package.json"), "{bad");
    await expect(discoverScripts(dir)).rejects.toThrow("package.json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
