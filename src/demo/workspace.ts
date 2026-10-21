import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createConfig } from "../config/store";
import { internalCommand, type InternalMode } from "../runtime/launch";

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export async function createDemoWorkspace(
  create: typeof createConfig = createConfig,
) {
  const directory = await mkdtemp(join(tmpdir(), "crew demo "));
  const dispose = () => rm(directory, { recursive: true, force: true });
  const command = (mode: InternalMode, args: string[]) =>
    internalCommand(mode, args).map(quote).join(" ");
  try {
    const doc = await create(join(directory, "crew.toml"), {
      name: "Playground",
      services: [
        {
          id: "web",
          repo: "playground",
          cwd: directory,
          command: command("demo-server", ["web"]),
          autostart: true,
        },
        {
          id: "api",
          repo: "playground",
          cwd: directory,
          command: command("demo-server", ["api"]),
          autostart: true,
        },
        {
          id: "worker",
          repo: "background",
          cwd: directory,
          command: command("demo-interactive", []),
          autostart: false,
        },
        {
          id: "failure",
          repo: "background",
          cwd: directory,
          command:
            "printf 'This demo exits with code 1. The other services keep running.\\n'; exit 1",
          autostart: false,
        },
      ],
    });
    return { path: doc.path, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
