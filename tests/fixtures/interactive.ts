console.log("crew interactive fixture · type a line and press Enter");
console.log(`Process: ${process.pid}`);
process.stdin.on("data", (bytes) =>
  console.log(`ANSWER:${bytes.toString().trim()}`),
);

export {};
