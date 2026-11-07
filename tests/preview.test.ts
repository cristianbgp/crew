import { afterEach, expect, test } from "bun:test";
import { Terminal } from "@xterm/headless";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { startPreview } from "../scripts/preview/server";
import { createConfig } from "../src/config/store";
import { alive, quote, waitFor } from "./helpers";

// DOM types omit Bun's runtime-only headers option.
const RuntimeWebSocket = WebSocket as unknown as {
  new (url: URL, options: Bun.WebSocketOptions): WebSocket;
};

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
  cleanups.length = 0;
});

async function preview() {
  const dir = await mkdtemp(join(tmpdir(), "crew-preview-test-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  const config = await createConfig(join(dir, "crew.toml"), {
    name: "Preview test",
    services: [
      {
        id: "interactive",
        repo: "test",
        cwd: dir,
        autostart: true,
        command: `${quote(process.execPath)} --no-env-file ${quote(resolve("tests/fixtures/interactive.ts"))}`,
      },
    ],
  });
  const server = startPreview({ port: 0, configPath: config.path });
  cleanups.push(() => server.stop());
  const response = await fetch(new URL("/session", server.url));
  const { token } = (await response.json()) as { token: string };
  const url = new URL("/terminal", server.url);
  url.protocol = "ws:";
  url.search = new URLSearchParams({
    token,
    cols: "110",
    rows: "34",
  }).toString();
  return { server, url };
}

async function connect(url: URL, origin: string) {
  const socket = new RuntimeWebSocket(url, { headers: { Origin: origin } });
  socket.binaryType = "arraybuffer";
  const screen = new Terminal({ cols: 110, rows: 34, allowProposedApi: true });
  let exitCode: number | undefined;
  socket.onmessage = ({ data }) => {
    if (typeof data === "string") exitCode = JSON.parse(data).code;
    else screen.write(new Uint8Array(data));
  };
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  screen.onData((data) => send({ type: "input", data }));
  cleanups.push(async () => {
    socket.close();
    screen.dispose();
  });
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("WebSocket failed"));
  });
  const frame = () =>
    Array.from(
      { length: screen.rows },
      (_, y) =>
        screen.buffer.active
          .getLine(y + screen.buffer.active.baseY)
          ?.translateToString(true) ?? "",
    ).join("\n");
  return { socket, screen, send, frame, exitCode: () => exitCode };
}

test("preview rejects foreign origins, missing tokens and invalid dimensions", async () => {
  const { server, url } = await preview();
  for (const [origin, token, cols] of [
    ["https://example.com", url.searchParams.get("token")!, "110"],
    [server.url.origin, "wrong", "110"],
    [server.url.origin, url.searchParams.get("token")!, "999999"],
  ]) {
    const attempt = new URL(url);
    attempt.searchParams.set("token", token!);
    attempt.searchParams.set("cols", cols!);
    const socket = new RuntimeWebSocket(attempt, {
      headers: { Origin: origin! },
    });
    let opened = false;
    socket.onopen = () => {
      opened = true;
      socket.close();
    };
    await new Promise<void>((resolve) => {
      socket.onclose = () => resolve();
    });
    expect(opened).toBe(false);
  }
  const response = await fetch(new URL("/session", server.url), {
    headers: { Origin: "https://example.com" },
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
});

test("preview forwards real CLI output, input and resize; disconnect stops services", async () => {
  const { server, url } = await preview();
  const client = await connect(url, server.url.origin);
  await waitFor(
    () => client.frame().includes("crew interactive fixture"),
    8000,
  );
  const pid = Number(/Process: (\d+)/.exec(client.frame())?.[1]);
  expect(pid).toBeGreaterThan(0);
  client.send({
    type: "input",
    data: "\x1b[<0;46;11M\x1b[<0;46;11mhello preview\r",
  });
  await waitFor(() => client.frame().includes("ANSWER:hello preview"));
  client.screen.resize(40, 12);
  client.send({ type: "resize", cols: 40, rows: 12 });
  await waitFor(
    () =>
      client.frame().includes("Services") && client.frame().includes("More"),
  );
  client.socket.close();
  await waitFor(() => !alive(pid), 8000);
}, 20000);

test("preview reports a normal CLI exit and closes the connection", async () => {
  const { server, url } = await preview();
  const client = await connect(url, server.url.origin);
  await waitFor(
    () => client.frame().includes("crew interactive fixture"),
    8000,
  );
  client.send({ type: "input", data: "\x11" });
  await waitFor(() => client.exitCode() === 0, 8000);
  await waitFor(() => client.socket.readyState === WebSocket.CLOSED);
}, 20000);

test("preview stop request acknowledges exit only after services have stopped", async () => {
  const { server, url } = await preview();
  const client = await connect(url, server.url.origin);
  await waitFor(
    () => client.frame().includes("crew interactive fixture"),
    8000,
  );
  const pid = Number(/Process: (\d+)/.exec(client.frame())?.[1]);
  expect(pid).toBeGreaterThan(0);
  client.send({ type: "stop" });
  await waitFor(() => client.exitCode() === 0, 8000);
  expect(alive(pid)).toBe(false);
  await waitFor(() => client.socket.readyState === WebSocket.CLOSED);
}, 20000);

test("preview closes malformed messages without crashing its HTTP server", async () => {
  const { server, url } = await preview();
  for (const message of [
    "{broken",
    JSON.stringify({ type: "resize", cols: -1, rows: 0 }),
  ]) {
    const client = await connect(url, server.url.origin);
    client.socket.send(message);
    await waitFor(() => client.socket.readyState === WebSocket.CLOSED, 8000);
  }
  expect((await fetch(server.url)).status).toBe(200);
}, 20000);

test("stopping the preview server stops active descendant services", async () => {
  const { server, url } = await preview();
  const client = await connect(url, server.url.origin);
  await waitFor(
    () => client.frame().includes("crew interactive fixture"),
    8000,
  );
  const pid = Number(/Process: (\d+)/.exec(client.frame())?.[1]);
  expect(pid).toBeGreaterThan(0);
  await server.stop();
  expect(alive(pid)).toBe(false);
  await waitFor(() => client.socket.readyState === WebSocket.CLOSED);
}, 20000);
