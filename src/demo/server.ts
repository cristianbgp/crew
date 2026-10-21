export async function runDemoServer(name: string): Promise<void> {
  let count = 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(`Hello from crew demo ${name}\n`),
  });
  console.log(`\x1b[1;32m${name} is running\x1b[0m`);
  console.log(`Local: http://127.0.0.1:${server.port}`);
  console.log("Type something and press Enter. Ctrl+C stops this service.");
  console.log(`Process: ${process.pid}`);
  const timer = setInterval(
    () =>
      console.log(
        `${new Date().toLocaleTimeString()}  ${name} · request #${++count}`,
      ),
    3000,
  );
  process.stdin.on("data", (bytes) =>
    console.log(`Received: ${bytes.toString().trim()}`),
  );
  const stop = () => {
    clearInterval(timer);
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
