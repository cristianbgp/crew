import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadWorkspaceState, saveWorkspaceState } from "./workspace";
test("workspace preferences survive reopen, isolate configs, and ignore corrupt files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "crew-state-"));
  try {
    const path = await saveWorkspaceState(
      "/repo/a/crew.toml",
      { selected: "api", collapsed: ["tools"] },
      dir,
    );
    expect(await loadWorkspaceState("/repo/a/crew.toml", dir)).toEqual({
      selected: "api",
      collapsed: ["tools"],
    });
    expect(await loadWorkspaceState("/repo/b/crew.toml", dir)).toEqual({
      selected: null,
      collapsed: [],
    });
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await writeFile(path, "{oops");
    expect(await loadWorkspaceState("/repo/a/crew.toml", dir)).toEqual({
      selected: null,
      collapsed: [],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
