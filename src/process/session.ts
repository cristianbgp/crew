/** An owned group leader stays alive until crew explicitly cleans up the session.
 * Keeping the leader prevents numeric PGID reuse after a service command exits.
 */
export async function runSession([shell, command]: [string, string]) {
  setInterval(() => {}, 60_000);
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  process.on("SIGHUP", () => {});
  try {
    const child = Bun.spawn([shell, "-c", command], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    process.send?.({ type: "command-exit", code });
  } catch (error) {
    console.error(String(error));
    process.send?.({ type: "command-exit", code: 1 });
  }
}
