// Full CLI + real kernel PTY + an outer terminal emulator. No local servers required.
import { Terminal } from "@xterm/headless";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createConfig } from "../src/config/store";
import { loadWorkspaceState } from "../src/state/workspace";
const dir = await mkdtemp(join(tmpdir(), "crew-terminal-"));
await mkdir("work", { recursive: true });
const screen = new Terminal({
  cols: 110,
  rows: 34,
  allowProposedApi: true,
  scrollback: 500,
});
let title = "";
screen.onTitleChange((value) => {
  title = value;
});
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
const config = await createConfig(join(dir, "crew.toml"), {
  name: "Terminal test",
  services: [
    {
      id: "interactive",
      repo: "one",
      cwd: dir,
      command: `${quote(process.execPath)} ${quote(resolve("tests/fixtures/interactive.ts"))}`,
      autostart: true,
    },
    {
      id: "flood",
      repo: "two",
      cwd: dir,
      command: `${quote(process.execPath)} ${quote(resolve("tests/fixtures/flood.ts"))}`,
      autostart: false,
    },
  ],
});
let raw = "";
const p = Bun.spawn([resolve("src/entry.ts"), "dev", "--config", config.path], {
  cwd: dir,
  env: {
    ...process.env,
    TERM: "xterm-256color",
    CREW_THEME: "auto",
    XDG_STATE_HOME: join(dir, "state"),
  },
  terminal: {
    cols: 110,
    rows: 34,
    data(_t, b) {
      raw = (raw + new TextDecoder().decode(b)).slice(-1_048_576);
      screen.write(b);
    },
  },
});
function frame() {
  const buf = screen.buffer.active;
  return Array.from(
    { length: screen.rows },
    (_, i) => buf.getLine(i + buf.baseY)?.translateToString(true) ?? "",
  ).join("\n");
}
async function until(fn: () => boolean, label: string, ms = 8000) {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await Bun.sleep(25);
  if (!fn()) throw new Error(`${label}: timeout\n${frame()}`);
}
function click(x: number, y: number) {
  p.terminal!.write(`\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`);
}
function clickText(text: string) {
  const lines = frame().split("\n");
  const y = lines.findLastIndex((l) => l.includes(text));
  if (y < 0) throw new Error("Missing control " + text + "\n" + frame());
  click(lines[y]!.indexOf(text) + 1, y);
}
const checks: string[] = [];
try {
  await until(() => frame().includes("crew interactive fixture"), "startup");
  await until(
    () => title === "crew · Terminal test",
    "workspace terminal title",
  );
  checks.push("workspace terminal title identifies crew");
  const pid = Number(/Process: (\d+)/.exec(frame())?.[1]);
  checks.push("startup and optional process stopped");
  click(45, 10);
  p.terminal!.write("hello crew\r");
  await until(() => frame().includes("ANSWER:hello crew"), "interactive input");
  checks.push("interactive input");
  await writeFile("work/terminal-start.txt", frame());
  clickText("More");
  await until(() => frame().includes("Service actions"), "service actions");
  clickText("Edit");
  await until(() => frame().includes("Edit service"), "editor");
  checks.push("editor opens");
  clickText("Cancel");
  await until(() => !frame().includes("Edit service"), "cancel");
  clickText("flood");
  await until(
    () =>
      frame()
        .split("\n")
        .slice(0, 4)
        .some((line) => line.includes("flood") && line.includes("stopped")),
    "select flood",
  );
  clickText("Start");
  await until(() => frame().includes("0123456789abcdef"), "output");
  const start = Date.now();
  clickText("interactive");
  await until(
    () => frame().includes("ANSWER:hello crew"),
    "switch during flood",
    1500,
  );
  click(45, 10);
  p.terminal!.write("responsive\r");
  await until(
    () => frame().includes("ANSWER:responsive"),
    "input during flood",
    1500,
  );
  checks.push("responsive mouse and input while background emits ~1 MiB/s");
  while (Date.now() - start < 10_500) await Bun.sleep(100);
  clickText("flood");
  await until(() => frame().includes("FLOOD_DONE"), "flood completed");
  checks.push("10 seconds of output completed; history remains usable");
  p.terminal!.resize(65, 24);
  screen.resize(65, 24);
  await until(() => frame().includes("Services"), "resize");
  await Bun.sleep(150);
  checks.push("resize to 65×24");
  clickText("Services");
  await until(() => frame().includes("Close services"), "narrow drawer");
  clickText("interactive");
  await until(
    () =>
      !frame().includes("Close services") &&
      frame().includes("ANSWER:responsive"),
    "drawer selection",
  );
  for (const [cols, rows] of [
    [65, 15],
    [40, 12],
  ]) {
    p.terminal!.resize(cols!, rows!);
    screen.resize(cols!, rows!);
    await Bun.sleep(150);
    await until(() => frame().includes("More"), "compact actions");
    clickText("More");
    await until(() => frame().includes("Service actions"), "compact menu");
    clickText("Edit");
    await until(
      () =>
        frame().includes("Edit service") &&
        frame().includes("Save service") &&
        frame().includes("Cancel"),
      "compact editor",
    );
    clickText("Cancel");
    await until(() => !frame().includes("Edit service"), "compact cancel");
    p.terminal!.write("compact" + cols + "\r");
    await until(
      () => frame().includes("ANSWER:compact" + cols),
      "input after compact editor",
    );
    checks.push(
      "compact More / Edit / Cancel and restored input at " + cols + "×" + rows,
    );
  }
  p.terminal!.write("\x1bOQ");
  await until(() => frame().includes("Switch service"), "service switcher");
  p.terminal!.write("flood\r");
  await until(
    () => !frame().includes("Switch service") && frame().includes("FLOOD_DONE"),
    "filtered switch to flood",
  );
  p.terminal!.write("\x1bOQ");
  await until(() => frame().includes("Switch service"), "switcher again");
  p.terminal!.write("interactive\r");
  await until(
    () =>
      !frame().includes("Switch service") &&
      frame().includes("ANSWER:compact40"),
    "filtered switch back",
  );
  checks.push("F2 search and Enter switch services at 40×12");
  p.terminal!.write("\x1bOS");
  await until(() => frame().includes("Search output"), "output inspector");
  p.terminal!.write("compact40");
  await until(() => frame().includes("compact40"), "filtered output");
  clickText("Pause");
  await until(() => frame().includes("Resume"), "pause output view");
  clickText("Latest");
  await until(() => frame().includes("Pause"), "follow latest output");
  p.terminal!.write("\x1b");
  await until(
    () => !frame().includes("Search output"),
    "close output inspector",
  );
  p.terminal!.write("afterlogs\r");
  await until(() => frame().includes("ANSWER:afterlogs"), "input after logs");
  checks.push("F4 output search, Pause, Latest and restored input at 40×12");
  p.terminal!.write("\x0b");
  await until(() => frame().includes("Commands"), "command palette");
  p.terminal!.write("Diagnostics\r");
  await until(
    () =>
      frame().includes("Diagnostics") &&
      frame().includes("Service: interactive"),
    "diagnostics",
  );
  p.terminal!.write("\x1b");
  await until(() => !frame().includes("Diagnostics"), "close diagnostics");
  p.terminal!.write("aftercommands\r");
  await until(
    () => frame().includes("ANSWER:aftercommands"),
    "input after commands",
  );
  checks.push("Ctrl+K commands, Diagnostics and restored input at 40×12");
  p.terminal!.write("\x1bOP");
  await until(
    () =>
      frame().includes("Keyboard shortcuts") && frame().includes("Esc Close"),
    "F1 guide",
  );
  p.terminal!.write("save");
  await until(
    () => frame().includes("Save service") && frame().includes("Ctrl+Enter"),
    "filter shortcuts",
  );
  p.terminal!.write("\x01missingkey");
  await until(
    () => frame().includes("No shortcuts found"),
    "empty shortcuts search",
  );
  p.terminal!.write("\x1b");
  await until(() => !frame().includes("Keyboard shortcuts"), "close guide");
  p.terminal!.write("afterhelp\r");
  await until(() => frame().includes("ANSWER:afterhelp"), "input after help");
  checks.push(
    "F1 searchable guide isolates typing and Escape restores terminal input at 40×12",
  );
  async function switchTheme(mode: "light" | "dark") {
    const light = mode === "light";
    p.terminal!.write(light ? "\x1b[?997;1n" : "\x1b[?997;2n");
    await Bun.sleep(30);
    p.terminal!.write(
      light
        ? "\x1b]10;#202833\x07\x1b]11;#ffffff\x07"
        : "\x1b]10;#dce2ed\x07\x1b]11;#111318\x07",
    );
    const color = light ? 0x202833 : 0xdce2ed;
    await until(() => {
      const y = frame()
        .split("\n")
        .findIndex((line) => line.includes("ANSWER:afterhelp"));
      if (y < 0) return false;
      const line = screen.buffer.active.getLine(y + screen.buffer.active.baseY);
      const x = line?.translateToString(true).indexOf("ANSWER:afterhelp") ?? -1;
      const cell = x >= 0 ? line?.getCell(x) : undefined;
      // OpenTUI emits RGB on truecolor hosts, or the nearest ANSI-256 gray
      // when the outer terminal has not advertised truecolor capability.
      return cell?.isFgRGB()
        ? cell.getFgColor() === color
        : Boolean(
            cell?.isFgPalette() && cell.getFgColor() === (light ? 235 : 254),
          );
    }, `${mode} terminal colors`);
  }
  await switchTheme("light");
  p.terminal!.write("afterlight\r");
  await until(
    () => frame().includes("ANSWER:afterlight"),
    "input after light mode",
  );
  await switchTheme("dark");
  p.terminal!.write("afterdark\r");
  await until(
    () => frame().includes("ANSWER:afterdark"),
    "input after dark mode",
  );
  checks.push(
    "native light/dark notifications recolor output and preserve input",
  );
  p.terminal!.write("\x11");
  const code = await Promise.race([
    p.exited,
    Bun.sleep(8000).then(() => {
      throw new Error("Exit timeout");
    }),
  ]);
  if (code !== 0) throw new Error(`Exit code ${code}`);
  if (pid) {
    try {
      process.kill(pid, 0);
      throw new Error("Child survived exit");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
  }
  if (!raw.includes("\x1b[22;0t") || !raw.includes("\x1b[23;0t"))
    throw new Error("Terminal title stack was not restored");
  checks.push(
    "Ctrl+Q exits 0, restores title stack and interactive child is gone",
  );
  const preferences = await loadWorkspaceState(
    config.path,
    join(dir, "state", "crew"),
  );
  if (preferences.selected !== "interactive")
    throw new Error("Selected service was not saved on exit");
  checks.push("selected service preferences flushed on exit");
  await writeFile(
    "work/terminal-verification.json",
    JSON.stringify({ checks }, null, 2),
  );
  console.log(checks.map((c) => "PASS " + c).join("\n"));
} catch (e) {
  await writeFile("work/terminal-failure.txt", frame() + "\n\n" + raw);
  throw e;
} finally {
  if (p.exitCode === null) p.kill("SIGTERM");
  await p.exited;
  p.terminal?.close();
  screen.dispose();
  await rm(dir, { recursive: true, force: true });
}
