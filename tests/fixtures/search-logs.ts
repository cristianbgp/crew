// A real service fixture for reviewing multiline errors and structured-log context.
const record = (level: string, message: string, extra = {}) =>
  console.log(JSON.stringify({ level, service: "api", message, ...extra }));

console.log("fixture ready · structured logs and multiline errors");
for (let index = 0; index < 12; index++)
  record("info", "request completed", {
    requestId: `request-${index}`,
    status: 200,
  });
console.log("ERROR checkout-42: database timeout");
console.log("    at connect (services/database.ts:42:17)");
console.log("    at checkout (routes/checkout.ts:81:9)");
console.log("Caused by: ECONNREFUSED 127.0.0.1:5432");
record("warn", "retry scheduled", {
  requestId: "checkout-42",
  attempt: 1,
  backoffMs: 500,
});
record("info", "connection recovered", { requestId: "checkout-42" });
for (let index = 12; index < 32; index++)
  record("info", "request completed", {
    requestId: `request-${index}`,
    status: 200,
  });
console.log("ERROR checkout-92: upstream timeout");
console.log("    at fetchInventory (services/inventory.ts:19:5)");
console.log("    at checkout (routes/checkout.ts:64:11)");
record("warn", "using cached inventory", {
  requestId: "checkout-92",
  ageSeconds: 3,
});
record("info", "request completed", { requestId: "checkout-92", status: 200 });
let heartbeat = 0;
setInterval(() => record("info", "heartbeat", { sequence: ++heartbeat }), 1000);
process.stdin.on("data", (bytes) =>
  record("info", "received input", { input: bytes.toString().trim() }),
);
export {};
