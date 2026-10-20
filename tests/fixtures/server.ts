const name = process.argv[2] ?? "server";
let count = 0;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch() {
    return new Response(`Hello from crew demo ${name}\n`);
  },
});
console.log(`\x1b[1;32m${name} is running\x1b[0m`);
console.log(`Local: http://127.0.0.1:${server.port}`);
console.log("Type something and press Enter. Ctrl+C stops this service.");
console.log(`Process: ${process.pid}`);
setInterval(
  () =>
    console.log(
      `\x1b[2m${new Date().toLocaleTimeString()}\x1b[0m  ${name} · request #${++count}`,
    ),
  3000,
);
process.stdin.on("data", (bytes) =>
  console.log(`\x1b[36mReceived:\x1b[0m ${bytes.toString().trim()}`),
);
process.on("SIGINT", () => {
  console.log(`\n${name} stopped.`);
  server.stop();
  process.exit(0);
});

export {};
