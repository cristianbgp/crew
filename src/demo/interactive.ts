export async function runDemoInteractive(): Promise<void> {
  console.log("crew demo worker · type a line and press Enter");
  console.log(`Process: ${process.pid}`);
  process.stdin.on("data", (bytes) =>
    console.log(`ANSWER:${bytes.toString().trim()}`),
  );
}
