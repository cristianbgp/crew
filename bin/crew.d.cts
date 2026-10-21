export function selectPlatform(host: {
  platform: string;
  arch: string;
  libc?: string;
}): string;
export function resolveBinary(name: string, root?: string): string;
export function run(
  args: string[],
): import("node:child_process").ChildProcess | undefined;
