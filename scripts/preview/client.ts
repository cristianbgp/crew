import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const status = document.querySelector<HTMLElement>("#status")!;
const size = document.querySelector<HTMLSelectElement>("#size")!;
const dimensions = document.querySelector<HTMLOutputElement>("#dimensions")!;
const container = document.querySelector<HTMLElement>("#terminal")!;
const viewport = document.querySelector<HTMLElement>("#viewport")!;
const restart = document.querySelector<HTMLButtonElement>("#restart")!;
function createTerminal() {
  const term = new Terminal({
    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
    fontSize: 14,
    lineHeight: 1.15,
    cursorBlink: true,
    scrollback: 1000,
    screenReaderMode: true,
    theme: { background: "#111318", foreground: "#dce2ed", cursor: "#dce2ed" },
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.open(container);
  term.onResize(({ cols, rows }) => send({ type: "resize", cols, rows }));
  term.onData((data) => send({ type: "input", data }));
  term.onBinary((data) => send({ type: "input", data }));
  return { term, fit };
}
let { term, fit } = createTerminal();
let socket: WebSocket | undefined;
let generation = 0;
let exited = false;
let connecting = false;
const setStatus = (text: string, state: string) => {
  status.textContent = text;
  status.dataset.state = state;
};
function send(value: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
function resize() {
  if (size.value === "auto") {
    container.style.width = "100%";
    container.style.height = "100%";
    const next = fit.proposeDimensions();
    if (next)
      term.resize(
        Math.max(20, Math.min(400, next.cols)),
        Math.max(8, Math.min(200, next.rows)),
      );
  } else {
    const [cols, rows] = size.value.split("x").map(Number);
    term.resize(cols!, rows!);
    const screen = container.querySelector<HTMLElement>(".xterm-screen")!;
    container.style.width = `${screen.offsetWidth + 15}px`;
    container.style.height = `${screen.offsetHeight}px`;
  }
  dimensions.value = `${term.cols} × ${term.rows}`;
}
size.addEventListener("change", () => {
  resize();
  term.focus();
});
new ResizeObserver(resize).observe(viewport);
resize();

async function connect() {
  if (connecting) return;
  connecting = true;
  restart.disabled = true;
  const current = ++generation;
  const previous = socket;
  socket = undefined;
  exited = false;
  setStatus(
    previous?.readyState === WebSocket.OPEN
      ? "Stopping services…"
      : "Connecting…",
    "connecting",
  );
  try {
    if (previous && previous.readyState !== WebSocket.CLOSED) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Shutdown timed out; close this tab and retry."));
        }, 8000);
        previous.addEventListener(
          "close",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        if (previous.readyState === WebSocket.OPEN)
          previous.send(JSON.stringify({ type: "stop" }));
        else previous.close();
      });
    }
    // A new emulator also discards queued writes and partially parsed escape sequences.
    term.dispose();
    ({ term, fit } = createTerminal());
    resize();
    if (window.self !== window.top)
      throw new Error("Open the preview in its own browser tab.");
    const response = await fetch("/session", { cache: "no-store" });
    if (!response.ok)
      throw new Error(`Session request failed (${response.status})`);
    const { token } = await response.json();
    if (current !== generation) return;
    const url = new URL("/terminal", location.href);
    url.protocol = "ws:";
    url.search = new URLSearchParams({
      token,
      cols: String(term.cols),
      rows: String(term.rows),
    }).toString();
    const connection = new WebSocket(url);
    let pendingBytes = 0;
    connection.binaryType = "arraybuffer";
    socket = connection;
    connection.onopen = () => {
      if (current !== generation) return;
      connecting = false;
      restart.disabled = false;
      setStatus("Connected", "connected");
      send({ type: "resize", cols: term.cols, rows: term.rows });
      term.focus();
    };
    connection.onmessage = ({ data }) => {
      if (current !== generation) return;
      if (typeof data === "string") {
        const message = JSON.parse(data);
        if (message.type === "exit") {
          exited = true;
          setStatus(
            `crew exited (${message.code}) · restart to continue`,
            "closed",
          );
        }
      } else {
        const bytes = new Uint8Array(data);
        pendingBytes += bytes.byteLength;
        if (pendingBytes > 1024 * 1024) {
          connection.close(
            1013,
            "Output exceeded the preview buffer; restart the session.",
          );
          return;
        }
        term.write(bytes, () => {
          pendingBytes -= bytes.byteLength;
        });
      }
    };
    connection.onerror = () => {
      if (current === generation) {
        connecting = false;
        restart.disabled = false;
        setStatus("Connection failed · restart to retry", "error");
      }
    };
    connection.onclose = (event) => {
      if (current !== generation) return;
      connecting = false;
      restart.disabled = false;
      if (exited) return;
      setStatus(
        event.reason || "Disconnected · restart to reconnect",
        "closed",
      );
    };
  } catch (error) {
    if (current === generation) {
      connecting = false;
      restart.disabled = false;
      setStatus(
        error instanceof Error ? error.message : "Could not connect",
        "error",
      );
    }
  }
}
const keys: Record<string, string> = {
  help: "\x1bOP",
  switch: "\x1bOQ",
  logs: "\x1bOS",
  quit: "\x11",
};
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-key]",
)) {
  button.addEventListener("click", () => {
    send({ type: "input", data: keys[button.dataset.key!] });
    term.focus();
  });
}
restart.addEventListener("click", () => {
  void connect();
});
window.addEventListener("pagehide", () => socket?.close());
void connect();
