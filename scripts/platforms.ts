export const platforms = [
  {
    id: "darwin-arm64",
    os: "darwin",
    cpu: "arm64",
    target: "bun-darwin-arm64",
    runner: "macos-14",
    packageName: "@cristianbgp/crew-darwin-arm64",
  },
  {
    id: "darwin-x64",
    os: "darwin",
    cpu: "x64",
    target: "bun-darwin-x64",
    runner: "macos-15-intel",
    packageName: "@cristianbgp/crew-darwin-x64",
  },
  {
    id: "linux-arm64",
    os: "linux",
    cpu: "arm64",
    target: "bun-linux-arm64",
    runner: "ubuntu-24.04-arm",
    packageName: "@cristianbgp/crew-linux-arm64",
  },
  {
    id: "linux-x64",
    os: "linux",
    cpu: "x64",
    target: "bun-linux-x64",
    runner: "ubuntu-24.04",
    packageName: "@cristianbgp/crew-linux-x64",
  },
] as const;
export type PlatformId = (typeof platforms)[number]["id"];
export function hostPlatform(
  os: string = process.platform,
  cpu: string = process.arch,
) {
  const platform = platforms.find((p) => p.os === os && p.cpu === cpu);
  if (!platform)
    throw new Error(
      `Unsupported platform: ${os}-${cpu}. crew supports macOS and glibc Linux on ARM64/x64.`,
    );
  return platform;
}
