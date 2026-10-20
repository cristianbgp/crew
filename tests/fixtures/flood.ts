const chunk = "0123456789abcdef".repeat(3) + "\n";
let ticks = 0;
const timer = setInterval(() => {
  process.stdout.write(chunk.repeat(1280));
  if (++ticks === 160) {
    clearInterval(timer);
    console.log("FLOOD_DONE");
  }
}, 64);
process.stdin.resume();
export {};
