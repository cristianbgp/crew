import { test, expect } from "bun:test";
import { createProcessManager } from "./manager";
import { waitFor, alive, quote } from "../../tests/helpers";
import { resolve } from "node:path";
const cwd = process.cwd();
const def = (id: string, command: string) => ({
  id,
  command,
  cwd,
  repo: "fixtures",
  autostart: true,
});

test("PTY accepts input and resizes; start is idempotent and stop is isolated", async () => {
  const m = createProcessManager(
    [
      def("a", 'read line; printf "ANSWER:%s\\n" "$line"; sleep 30'),
      def("b", "sleep 30"),
    ],
    { stopTimeoutMs: 150 },
  );
  let output = "";
  m.onOutput((e) => {
    if (e.id === "a") output += new TextDecoder().decode(e.bytes);
  });
  try {
    await m.start("a");
    const pid = m.getSnapshot()[0]!.pid;
    await m.start("a");
    expect(m.getSnapshot()[0]!.pid).toBe(pid);
    await m.start("b");
    m.resize("a", 70, 15);
    m.write("a", new TextEncoder().encode("hello\n"));
    await waitFor(() => output.includes("ANSWER:hello"));
    await m.stop("a");
    expect(m.getSnapshot()[0]!.state).toBe("stopped");
    expect(m.getSnapshot()[1]!.state).toBe("running");
  } finally {
    await m.shutdown();
    await m.shutdown();
  }
});
test("failed command preserves error while another service runs, restart uses new definition", async () => {
  const m = createProcessManager(
    [def("bad", "exit 7"), def("good", "sleep 30")],
    { stopTimeoutMs: 100 },
  );
  let output = "";
  m.onOutput((e) => (output += new TextDecoder().decode(e.bytes)));
  try {
    await m.start("good");
    await m.start("bad");
    await waitFor(
      () => m.getSnapshot().find((s) => s.id === "bad")!.state === "error",
    );
    expect(m.getSnapshot().find((s) => s.id === "bad")!.exitCode).toBe(7);
    m.updateDefinitions([
      def("bad", "printf RESTARTED; sleep 30"),
      def("good", "sleep 30"),
    ]);
    await m.restart("bad");
    await waitFor(() => output.includes("RESTARTED"));
    expect(m.getSnapshot().find((s) => s.id === "good")!.state).toBe("running");
  } finally {
    await m.shutdown();
  }
});
test("shutdown kills a whole owned process group, including SIGINT-resistant children", async () => {
  const cmd = `${quote(process.execPath)} ${quote(resolve("tests/fixtures/process-tree.ts"))}`;
  const m = createProcessManager([def("tree", cmd)], { stopTimeoutMs: 100 });
  let text = "";
  m.onOutput((e) => (text += new TextDecoder().decode(e.bytes)));
  try {
    await m.start("tree");
    await waitFor(() => /CHILD:\d+/.test(text));
    const child = Number(/CHILD:(\d+)/.exec(text)![1]);
    const control = Bun.spawn(["sh", "-c", "sleep 30"]);
    try {
      await m.shutdown();
      await waitFor(() => !alive(child));
      expect(alive(control.pid)).toBe(true);
    } finally {
      control.kill();
      await control.exited;
    }
  } finally {
    await m.shutdown();
  }
});
test("retains output and group ownership after the leader exits", async () => {
  const m = createProcessManager(
    [def("x", `sleep 30 & echo CHILD:$!; exit 0`)],
    { stopTimeoutMs: 100 },
  );
  let text = "";
  m.onOutput((e) => (text += new TextDecoder().decode(e.bytes)));
  try {
    await m.start("x");
    await waitFor(() => /CHILD:\d+/.test(text));
    const child = Number(/CHILD:(\d+)/.exec(text)![1]);
    await waitFor(() => m.getSnapshot()[0]!.state === "exited");
    expect(new TextDecoder().decode(m.history("x"))).toContain("CHILD:");
    await m.shutdown();
    await waitFor(() => !alive(child));
  } finally {
    await m.shutdown();
  }
});
test("keeps an owned session anchor alive after the command exits, until cleanup", async () => {
  const m = createProcessManager([def("quick", "exit 0")], {
    stopTimeoutMs: 100,
  });
  try {
    await m.start("quick");
    const leader = m.getSnapshot()[0]!.pid!;
    await waitFor(() => m.getSnapshot()[0]!.state === "exited");
    expect(alive(leader)).toBe(true);
    await m.stop("quick");
    await waitFor(() => !alive(leader));
  } finally {
    await m.shutdown();
  }
});
