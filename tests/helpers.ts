import { expect } from "bun:test";
export async function waitFor(fn: () => boolean, ms = 2500) {
  const deadline = Date.now() + ms;
  while (!fn() && Date.now() < deadline) await Bun.sleep(10);
  expect(fn()).toBe(true);
}
export function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export function quote(s: string) {
  return "'" + s.replaceAll("'", "'\\''") + "'";
}
