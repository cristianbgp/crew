// Real native executable in a directory without source, dependencies or runtimes.
import { Terminal } from "@xterm/headless";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createConfig, loadConfig } from "../src/config/store";
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
  const helpProcess = Bun.spawn([binary, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: "" },
  });
  const help = await new Response(helpProcess.stdout).text();
  if (
    (await helpProcess.exited) !== 0 ||
    !help.includes("crew dev") ||
    help.includes("bun --no-env-file")
  )
    throw new Error(
      "Native help must describe the installed command without source runtime instructions",
    );
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
  for (const phase of ["workspace", "renderer"] as const) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      let startupOutput = "";
      let signaled = false;
      child = Bun.spawn([binary, "demo"], {
        cwd: directory,
        env: { ...env, TMPDIR: directory },
        terminal: {
          cols: 100,
          rows: 30,
          data(_terminal, bytes) {
            startupOutput += new TextDecoder().decode(bytes);
            if (
              phase === "renderer" &&
              !signaled &&
              startupOutput.includes("\x1b[22;0t")
            ) {
              signaled = true;
              child!.kill(signal);
            }
          },
        },
      });
      const deadline = Date.now() + 10000;
      let created = false;
      while (Date.now() < deadline && child.exitCode === null) {
        if (
          (await readdir(directory)).some((name) =>
            name.startsWith("crew demo "),
          )
        ) {
          created = true;
          break;
        }
        await Bun.sleep(1);
      }
      if (!created)
        throw new Error("Early demo interruption never acquired a workspace");
      if (phase === "workspace") {
        signaled = true;
        child.kill(signal);
      }
      await until(
        () => child!.exitCode !== null || Boolean(child!.signalCode),
        `Early demo ${signal} (${phase})`,
      );
      if (!signaled)
        throw new Error(`Early demo ${phase} interruption was not exercised`);
      if (
        (await readdir(directory)).some((name) => name.startsWith("crew demo "))
      )
        throw new Error(`Early ${signal} abandoned the demo directory`);
      if (child.exitCode !== 0)
        throw new Error(
          `Early ${signal} (${phase}) did not finish orderly shutdown: ${child.exitCode}/${child.signalCode}\n${startupOutput.slice(-4000)}`,
        );
      child.terminal!.close();
      checks.push(
        `early demo ${signal} cleans temporary resources during ${phase} initialization`,
      );
    }
  }
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
  let pid = Number(/Process: (\d+)/.exec(frame())?.[1]);
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
  child.terminal!.write("\x0b");
  await until(
    () => frame().includes("Search services"),
    "Native commands palette input",
  );
  const searchRow = frame()
    .split("\n")
    .findIndex((line) => line.includes("Search services"));
  if (searchRow < 0) throw new Error("Native commands search is missing");
  child.terminal!.write(
    `\x1b[<0;5;${searchRow + 1}M\x1b[<0;5;${searchRow + 1}m`,
  );
  await until(
    () => screen.buffer.active.cursorY === searchRow,
    "Native commands input focus",
  );
  child.terminal!.write("restart");
  await until(
    () => frame().includes("Restart service"),
    "Native restart action",
  );
  child.terminal!.write("\r");
  const previous = pid;
  await until(() => {
    const current = Number(
      [...frame().matchAll(/Process: (\d+)/g)].at(-1)?.[1],
    );
    if (current && current !== previous) {
      pid = current;
      return true;
    }
    return false;
  }, "Native restarted service");
  if (alive(previous))
    throw new Error("Previous native service survived restart");
  child.terminal!.write("after-restart\r");
  await until(
    () => frame().includes("ANSWER:after-restart"),
    "Native restarted input",
  );
  checks.push(
    "restart replaces the owned process and restores interactive input",
  );
  child.terminal!.write("\x11");
  await until(() => child!.exitCode !== null, "Native quit");
  if (child.exitCode !== 0 || alive(pid))
    throw new Error(`Native quit/cleanup failed: ${child.exitCode}`);
  checks.push("Ctrl+Q exits cleanly and the shell child is gone");
  for (const stop of ["quit", "SIGTERM", "SIGHUP"] as const) {
    screen.reset();
    screen.resize(100, 30);
    child.terminal!.close();
    child = Bun.spawn([binary, "demo"], {
      cwd: directory,
      env: { ...env, TMPDIR: directory },
      terminal: {
        cols: 100,
        rows: 30,
        data(_term, bytes) {
          screen.write(bytes);
        },
      },
    });
    await until(
      () => frame().includes("web is running") && frame().includes("Ctrl+Q"),
      "Native demo startup",
    );
    const demoPid = Number(/Process: (\d+)/.exec(frame())?.[1]);
    const url = /http:\/\/127\.0\.0\.1:\d+/.exec(frame())?.[0];
    if (!demoPid || !url)
      throw new Error(`Missing native demo details\n${frame()}`);
    if ((await (await fetch(url)).text()) !== "Hello from crew demo web\n")
      throw new Error("Native demo did not respond");
    const temporary = (await readdir(directory)).filter((name) =>
      name.startsWith("crew demo "),
    );
    if (temporary.length !== 1)
      throw new Error("Missing private native demo directory");
    if (stop === "quit") child.terminal!.write("\x11");
    else child.kill(stop);
    await until(() => child!.exitCode !== null, `Native demo ${stop}`);
    if (child.exitCode !== 0 || alive(demoPid))
      throw new Error(`Native demo cleanup failed (${stop})`);
    if (
      (await readdir(directory)).some((name) => name.startsWith("crew demo "))
    )
      throw new Error("Native demo directory survived exit");
    checks.push(
      `native demo HTTP and private directory cleanup (${stop}) without Bun/Node`,
    );
  }
  const start = (args: string[], cwd: string) => {
    child!.terminal!.close();
    screen.reset();
    screen.resize(100, 30);
    return Bun.spawn([binary, ...args], {
      cwd,
      env,
      terminal: {
        cols: 100,
        rows: 30,
        data(_term, bytes) {
          screen.write(bytes);
        },
      },
    });
  };
  const click = (label: string) => {
    const lines = frame().split("\n"),
      y = lines.findLastIndex((line) => line.includes(label));
    if (y < 0) throw new Error(`Missing native control: ${label}\n${frame()}`);
    const x = lines[y]!.indexOf(label) + 1;
    child!.terminal!.write(
      `\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`,
    );
  };
  const workspace = join(directory, "new workspace é");
  await mkdir(workspace);
  child = start([], workspace);
  await until(
    () =>
      frame().includes("Create your workspace") &&
      frame().includes("Save & start"),
    "Native first-run wizard",
  );
  click("Add service");
  const focused = (label: string) =>
    until(() => {
      const y = frame()
        .split("\n")
        .findIndex((line) => line.includes(label));
      return y >= 0 && screen.buffer.active.cursorY === y + 1;
    }, `Native form focus: ${label}`);
  await focused("Service name");
  child!.terminal!.write("first-run");
  child!.terminal!.write("\t");
  await focused("Repo / group");
  child!.terminal!.write("\t");
  await focused("Directory");
  child!.terminal!.write("\t");
  await focused("Command");
  child!.terminal!.write(
    'printf "FIRST_RUN_READY:%s\\n" "$$"; while IFS= read -r line; do printf "ANSWER:%s\\n" "$line"; done',
  );
  await until(
    () => frame().includes("ANSWER:%s") && frame().includes("; done"),
    "Native service command entry",
  );
  click("Save service");
  await until(
    () => frame().includes("Save & start") && frame().includes("first-run"),
    "Native saved service",
  );
  click("Save & start");
  await until(
    () => /FIRST_RUN_READY:\d+/.test(frame()) && frame().includes("Ctrl+Q"),
    "Native first-run service startup",
  );
  const firstPid = Number(/FIRST_RUN_READY:(\d+)/.exec(frame())?.[1]);
  child!.terminal!.write("\x11");
  await until(() => child!.exitCode !== null, "Native first-run quit");
  if (child!.exitCode !== 0 || alive(firstPid))
    throw new Error("Native first-run shutdown failed");
  if (
    (await loadConfig(join(workspace, "crew.toml")))?.config.services[0]?.id !==
    "first-run"
  )
    throw new Error("Native first-run configuration was not saved");
  checks.push(
    "first-run wizard saves a service and starts it without external runtimes",
  );

  const resistant = join(directory, "resistant");
  await mkdir(resistant);
  await createConfig(join(resistant, "crew.toml"), {
    name: "resistant",
    services: [
      {
        id: "resistant",
        repo: "native",
        cwd: resistant,
        autostart: true,
        command:
          'trap "" INT TERM; /bin/sleep 30 & printf "RESISTANT_CHILD:%s\\n" "$!"; wait',
      },
    ],
  });
  child = start([], resistant);
  await until(
    () => /RESISTANT_CHILD:\d+/.test(frame()) && frame().includes("Ctrl+Q"),
    "Native resistant child startup",
  );
  const resistantPid = Number(/RESISTANT_CHILD:(\d+)/.exec(frame())?.[1]);
  if (!alive(resistantPid))
    throw new Error(
      "Native resistant descendant exited before cleanup was exercised",
    );
  child!.terminal!.write("\x11");
  await until(() => child!.exitCode !== null, "Native forced group cleanup");
  await until(
    () => !alive(resistantPid),
    "Native resistant descendant cleanup",
  );
  if (child!.exitCode !== 0)
    throw new Error("Native forced cleanup exit status failed");
  checks.push(
    "quit force-stops SIGINT/SIGTERM-resistant descendants in the owned group",
  );

  const readiness = join(directory, "readiness");
  await mkdir(readiness);
  await createConfig(join(readiness, "crew.toml"), {
    name: "readiness",
    services: [
      {
        id: "waiting",
        repo: "native",
        cwd: readiness,
        autostart: true,
        command: 'printf "WAIT_PID:%s\\n" "$$"; read line',
        ready: { log: "NEVER_READY", timeoutMs: 150 },
      },
      {
        id: "healthy",
        repo: "native",
        cwd: readiness,
        autostart: true,
        command: 'printf "HEALTHY_PID:%s\\n" "$$"; read line',
      },
    ],
  });
  child = start([], readiness);
  await until(
    () => frame().includes("unready") && /WAIT_PID:\d+/.test(frame()),
    "Native readiness failure",
  );
  const waitingPid = Number(/WAIT_PID:(\d+)/.exec(frame())?.[1]);
  child!.terminal!.write("\x1bOQ");
  await until(
    () => frame().includes("Search name"),
    "Native healthy service switcher",
  );
  child!.terminal!.write("healthy\r");
  await until(
    () => /HEALTHY_PID:\d+/.test(frame()),
    "Native healthy service after peer readiness failure",
  );
  const healthyPid = Number(/HEALTHY_PID:(\d+)/.exec(frame())?.[1]);
  if (!alive(healthyPid))
    throw new Error("Native readiness failure stopped the healthy peer");
  child!.terminal!.write("\x11");
  await until(
    () => child!.exitCode !== null,
    "Native readiness workspace quit",
  );
  if (child!.exitCode !== 0 || alive(waitingPid) || alive(healthyPid))
    throw new Error("Native readiness workspace cleanup failed");
  checks.push(
    "readiness failure leaves healthy services usable and all processes still clean up",
  );

  const corrupt = join(directory, "corrupt.toml");
  await writeFile(corrupt, "name = [\n");
  child = start(["--config", corrupt], directory);
  await until(
    () => child!.exitCode !== null,
    "Native malformed configuration exit",
  );
  await until(
    () => frame().includes("crew:"),
    "Native malformed configuration diagnostic",
  );
  if (child!.exitCode !== 1)
    throw new Error("Native malformed configuration did not fail");
  checks.push("malformed configuration fails visibly before services start");
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
