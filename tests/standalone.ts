// Real native executable in a directory without source, dependencies or runtimes.
import { Terminal } from "@xterm/headless";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createConfig } from "../src/config/store";
import { alive } from "./helpers";

const index = process.argv.indexOf("--binary");
if (index < 0 || !process.argv[index + 1])
  throw new Error("Usage: bun tests/standalone.ts --binary <path>");
const source = resolve(process.argv[index + 1]!);
const directory = await mkdtemp(join(tmpdir(), "crew native é "));
const binary = join(directory, "crew");
const screen = new Terminal({ cols: 100, rows: 30, allowProposedApi: true });
let child: Bun.Subprocess | undefined;
const checks: string[] = [];
const frame = () =>
  Array.from(
    { length: screen.rows },
    (_, y) =>
      screen.buffer.active
        .getLine(y + screen.buffer.active.baseY)
        ?.translateToString(true) ?? "",
  ).join("\n");
async function until(condition: () => boolean, label: string) {
  const end = Date.now() + 10000;
  while (!condition() && Date.now() < end) await Bun.sleep(25);
  if (!condition()) throw new Error(`${label}\n${frame()}`);
}
try {
  await copyFile(source, binary);
  await chmod(binary, 0o755);
  const tools = join(directory, "empty-path");
  await mkdir(tools);
  await writeFile(
    join(directory, ".env"),
    "CREW_STANDALONE_SENTINEL=from-launch-directory\nCREW_THEME=invalid\n",
  );
  await createConfig(join(directory, "crew.toml"), {
    name: "Standalone fixture",
    services: [
      {
        id: "shell",
        repo: "native",
        cwd: directory,
        autostart: true,
        command:
          'printf "Process: %s\\nENV:%s\\n" "$$" "${CREW_STANDALONE_SENTINEL-unset}"; while IFS= read -r line; do printf "ANSWER:%s\\n" "$line"; done',
      },
    ],
  });
  const env = {
    ...process.env,
    PATH: tools,
    SHELL: "/bin/sh",
    TERM: "xterm-256color",
    CREW_THEME: undefined,
    CREW_STANDALONE_SENTINEL: undefined,
    XDG_STATE_HOME: join(directory, "state"),
  };
  child = Bun.spawn([binary], {
    cwd: directory,
    env,
    terminal: {
      cols: 100,
      rows: 30,
      data(_term, bytes) {
        screen.write(bytes);
      },
    },
  });
  await until(
    () => frame().includes("ENV:unset") && frame().includes("Ctrl+Q"),
    "Native startup and environment isolation",
  );
  const pid = Number(/Process: (\d+)/.exec(frame())?.[1]);
  if (!pid) throw new Error("Missing native shell PID");
  checks.push(
    "native UI, embedded OpenTUI assets and self-hosted supervisor without Bun/Node on PATH",
  );
  checks.push("launch-folder dotenv is not inherited by the service");
  child.terminal!.write("native-input\r");
  await until(
    () => frame().includes("ANSWER:native-input"),
    "Native interactive input",
  );
  child.terminal!.resize(65, 15);
  screen.resize(65, 15);
  child.terminal!.write("resized\r");
  await until(() => frame().includes("ANSWER:resized"), "Native resized input");
  checks.push("interactive input and resize preserve the service session");
  child.terminal!.write("\x11");
  await until(() => child!.exitCode !== null, "Native quit");
  if (child.exitCode !== 0 || alive(pid))
    throw new Error(`Native quit/cleanup failed: ${child.exitCode}`);
  checks.push("Ctrl+Q exits cleanly and the shell child is gone");
  console.log(checks.map((check) => `PASS ${check}`).join("\n"));
} finally {
  if (child?.exitCode === null) {
    child.kill("SIGTERM");
    await child.exited;
  }
  child?.terminal?.close();
  screen.dispose();
  await rm(directory, { recursive: true, force: true });
}
