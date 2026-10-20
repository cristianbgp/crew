// Fixed-size, continuous output plus an interactive acknowledgement.
const chunk = "crew soak 0123456789abcdef\n".repeat(128);
setInterval(() => process.stdout.write(chunk), 50);
let input = "";
for await (const bytes of Bun.stdin.stream()) {
  input += new TextDecoder().decode(bytes);
  if (input.includes("\n")) {
    console.log("SOAK_ACK:" + input.trim());
    input = "";
  }
}

export {};
