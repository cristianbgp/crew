process.on("SIGINT", () => {});
const child = Bun.spawn(
  ["sh", "-c", "trap '' INT TERM; while :; do sleep 1; done"],
  { stdout: "ignore", stderr: "ignore" },
);
console.log(`CHILD:${child.pid}`);
setInterval(() => {}, 1000);
