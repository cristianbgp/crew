// Real PTYs plus mounted native terminal panes. Run longer with SOAK_SECONDS=7200.
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createProcessManager } from "../src/process/manager";
import { App } from "../src/ui/App";
import { quote, alive } from "./helpers";
const seconds = Number(process.env.SOAK_SECONDS ?? 60);
const count = Number(process.env.SOAK_SERVICES ?? 12);
if (
  !Number.isInteger(seconds) ||
  seconds < 5 ||
  seconds > 86400 ||
  !Number.isInteger(count) ||
  count < 2 ||
  count > 64
)
  throw new Error("SOAK_SECONDS must be 5–86400; SOAK_SERVICES must be 2–64");
const services = Array.from({ length: count }, (_, i) => ({
  id: `service-${i}`,
  repo: `group-${i % 3}`,
  cwd: process.cwd(),
  command: `${quote(process.execPath)} ${quote(resolve("tests/fixtures/soak-output.ts"))}`,
  autostart: false,
}));
const manager = createProcessManager(services, { stopTimeoutMs: 150 });
const t = await testRender(
  <App
    config={{ name: "Soak", services }}
    manager={manager}
    onQuit={() => {}}
  />,
  { width: 100, height: 30 },
);
const samples: {
  second: number;
  rssMiB: number;
  heapMiB: number;
  historyBytes: number;
  eventLoopDelayMs: number;
  inputMs: number;
}[] = [];
let totalBytes = 0;
const off = manager.onOutput((e) => {
  totalBytes += e.bytes.byteLength;
});
let pids: number[] = [];
const started = Date.now();
try {
  await act(async () => {
    await Promise.all(services.map((s) => manager.start(s.id)));
  });
  pids = manager
    .getSnapshot()
    .map((s) => s.pid!)
    .filter(Boolean);
  for (let i = 0; i < seconds; i++) {
    const tick = performance.now();
    await Bun.sleep(1000);
    const delay = Math.max(0, performance.now() - tick - 1000);
    const before = manager.history("service-0");
    const inputStart = performance.now();
    manager.write("service-0", new TextEncoder().encode(`ping-${i}\n`));
    while (
      !new TextDecoder()
        .decode(manager.history("service-0").subarray(-20000))
        .includes(`SOAK_ACK:ping-${i}\r`) &&
      performance.now() - inputStart < 2000
    )
      await Bun.sleep(10);
    const inputMs = performance.now() - inputStart;
    if (inputMs >= 2000)
      throw new Error("Interactive service failed to respond within 2 seconds");
    // Also exercise command menu and native layout while all services emit output.
    if (i % 10 === 0)
      await act(async () => {
        t.mockInput.pressKey("k", { ctrl: true });
        await Bun.sleep(40);
      });
    if (i % 10 === 1)
      await act(async () => {
        t.mockInput.pressEscape();
        await Bun.sleep(40);
      });
    await act(async () => {
      await t.renderOnce();
    });
    if (
      before.byteLength > 1048576 ||
      services.some((s) => manager.history(s.id).byteLength > 1048576)
    )
      throw new Error("Replay buffer exceeded its bound");
    const memory = process.memoryUsage();
    samples.push({
      second: i + 1,
      rssMiB: memory.rss / 1048576,
      heapMiB: memory.heapUsed / 1048576,
      historyBytes: services.reduce(
        (n, s) => n + manager.history(s.id).byteLength,
        0,
      ),
      eventLoopDelayMs: delay,
      inputMs,
    });
    if ((i + 1) % 15 === 0)
      console.log(
        `Soak ${i + 1}/${seconds}s: RSS ${(memory.rss / 1048576).toFixed(1)} MiB`,
      );
  }
} finally {
  off();
  await act(async () => {
    await manager.shutdown();
    await t.dispose();
  });
}
if (pids.some(alive))
  throw new Error("Owned session remained alive after shutdown");
await mkdir("work", { recursive: true });
const result = {
  seconds: (Date.now() - started) / 1000,
  services: count,
  totalBytes,
  maxRssMiB: Math.max(...samples.map((s) => s.rssMiB)),
  maxInputMs: Math.max(...samples.map((s) => s.inputMs)),
  maxEventLoopDelayMs: Math.max(...samples.map((s) => s.eventLoopDelayMs)),
  cleanup: "all owned sessions stopped",
  samples,
};
await writeFile(
  "work/soak-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      ...result,
      samples: `${samples.length} samples in work/soak-verification.json`,
    },
    null,
    2,
  ),
);
