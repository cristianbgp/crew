import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
export interface WorkspaceState {
  selected: string | null;
  collapsed: string[];
}
export function stateDirectory() {
  return join(
    process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"),
    "crew",
  );
}
function statePath(workspace: string, directory: string) {
  const key = createHash("sha256").update(resolve(workspace)).digest("hex");
  return join(directory, `${key}.json`);
}
export async function loadWorkspaceState(
  workspace: string,
  directory = stateDirectory(),
): Promise<WorkspaceState> {
  try {
    const value: unknown = JSON.parse(
      await readFile(statePath(workspace, directory), "utf8"),
    );
    if (value && typeof value === "object") {
      const s = value as Record<string, unknown>;
      return {
        selected: typeof s.selected === "string" ? s.selected : null,
        collapsed: Array.isArray(s.collapsed)
          ? s.collapsed.filter((v): v is string => typeof v === "string")
          : [],
      };
    }
  } catch {}
  return { selected: null, collapsed: [] };
}
export async function saveWorkspaceState(
  workspace: string,
  state: WorkspaceState,
  directory = stateDirectory(),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = statePath(workspace, directory);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  return path;
}
