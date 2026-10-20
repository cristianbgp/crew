import { createConnection } from "node:net";
import { stripVTControlCharacters } from "node:util";
import type { ReadyCheck } from "../config/types";
export async function probeReady(
  check: ReadyCheck,
  signal: AbortSignal,
  output: string,
): Promise<boolean> {
  if (signal.aborted) return false;
  if ("log" in check)
    return stripVTControlCharacters(output).includes(check.log);
  if ("http" in check) {
    try {
      const response = await fetch(check.http, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
        redirect: "manual",
      });
      await response.body?.cancel();
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }
  return new Promise((resolve) => {
    const socket = createConnection({
      host: check.host ?? "127.0.0.1",
      port: check.port,
    });
    const done = (result: boolean) => {
      signal.removeEventListener("abort", abort);
      socket.destroy();
      resolve(result);
    };
    const abort = () => done(false);
    signal.addEventListener("abort", abort, { once: true });
    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}
