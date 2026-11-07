import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import page from "./index.html";

type Session = {
  cols: number;
  rows: number;
  process?: Bun.Subprocess;
  stopping?: Promise<void>;
};

function dimensions(cols: number, rows: number) {
  return (
    Number.isInteger(cols) &&
    cols >= 20 &&
    cols <= 400 &&
    Number.isInteger(rows) &&
    rows >= 8 &&
    rows <= 200
  );
}

export function startPreview(
  options: { port?: number; configPath?: string } = {},
) {
  const token = crypto.randomUUID();
  const sessions = new Set<Session>();
  let stopping: Promise<void> | undefined;
  const entry = fileURLToPath(new URL("../../src/entry.ts", import.meta.url));
  const args = options.configPath
    ? ["dev", "--config", resolve(options.configPath)]
    : ["demo"];

  async function stopSession(session: Session) {
    if (session.stopping) return session.stopping;
    session.stopping = (async () => {
      const child = session.process;
      if (!child) return;
      if (child.exitCode === null) child.kill("SIGTERM");
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 6000);
      try {
        await child.exited;
      } finally {
        clearTimeout(timer);
        child.terminal?.close();
        sessions.delete(session);
      }
    })();
    return session.stopping;
  }

  const server = Bun.serve<Session>({
    hostname: "127.0.0.1",
    port: options.port ?? 0,
    development: false,
    routes: { "/": page },
    fetch(request, server) {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin");
      if (
        request.headers.get("Host") !== server.url.host ||
        (origin !== null && origin !== server.url.origin)
      ) {
        return new Response(
          "This preview only accepts same-origin local requests.",
          { status: 403 },
        );
      }
      if (request.method !== "GET")
        return new Response("Method not allowed", { status: 405 });
      if (url.pathname === "/session") {
        return Response.json(
          { token },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if (url.pathname === "/terminal") {
        if (stopping)
          return new Response("Preview is stopping", { status: 503 });
        if (
          origin !== server.url.origin ||
          url.searchParams.get("token") !== token
        ) {
          return new Response("Preview connection denied", { status: 403 });
        }
        const cols = Number(url.searchParams.get("cols"));
        const rows = Number(url.searchParams.get("rows"));
        if (!dimensions(cols, rows))
          return new Response("Invalid terminal dimensions", { status: 400 });
        if (server.upgrade(request, { data: { cols, rows } })) return;
        return new Response("WebSocket upgrade required", { status: 400 });
      }
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      idleTimeout: 0,
      maxPayloadLength: 64 * 1024,
      backpressureLimit: 1024 * 1024,
      closeOnBackpressureLimit: true,
      open(socket) {
        const session = socket.data;
        sessions.add(session);
        try {
          const child = Bun.spawn(
            [process.execPath, "--no-env-file", entry, ...args],
            {
              cwd: fileURLToPath(new URL("../../", import.meta.url)),
              env: {
                ...process.env,
                TERM: "xterm-256color",
                COLORTERM: "truecolor",
                CREW_THEME: "dark",
              },
              terminal: {
                cols: session.cols,
                rows: session.rows,
                data(_terminal, bytes) {
                  if (
                    socket.readyState === WebSocket.OPEN &&
                    socket.sendBinary(bytes) === 0
                  ) {
                    socket.close(
                      1013,
                      "Output exceeded the preview buffer; restart the session.",
                    );
                  }
                },
              },
            },
          );
          session.process = child;
          void child.exited.then((code) => {
            child.terminal?.close();
            sessions.delete(session);
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "exit", code }));
              socket.close(1000, "crew exited");
            }
          });
        } catch (error) {
          sessions.delete(session);
          console.error("Could not start preview:", error);
          socket.close(1011, "Could not start crew");
        }
      },
      message(socket, message) {
        try {
          if (typeof message !== "string") throw new Error("Expected JSON");
          const value = JSON.parse(message);
          const terminal = socket.data.process?.terminal;
          if (value.type === "stop") void stopSession(socket.data);
          else if (value.type === "input" && typeof value.data === "string")
            terminal?.write(value.data);
          else if (
            value.type === "resize" &&
            dimensions(value.cols, value.rows)
          )
            terminal?.resize(value.cols, value.rows);
          else throw new Error("Invalid terminal message");
        } catch {
          socket.close(1008, "Invalid terminal message");
        }
      },
      close(socket) {
        void stopSession(socket.data);
      },
    },
  });

  return {
    url: server.url,
    stop() {
      return (stopping ??= (async () => {
        await Promise.all([...sessions].map(stopSession));
        await server.stop(true);
      })());
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (
    args.length &&
    (args.length !== 2 || args[0] !== "--config" || !args[1])
  ) {
    console.error("Usage: bun run preview [--config path/to/crew.toml]");
    process.exit(1);
  }
  const preview = startPreview({ configPath: args[1] });
  console.log(`crew terminal preview: ${preview.url}`);
  console.log(
    args[1]
      ? "Using the selected workspace. Changes and service commands are real."
      : "Disposable demo workspace · each tab starts a separate session.",
  );
  const shutdown = () => {
    void preview.stop().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
