import { fileURLToPath } from "node:url";

declare const __CREW_STANDALONE__: boolean;
export const standalone =
  typeof __CREW_STANDALONE__ !== "undefined" && __CREW_STANDALONE__;
export type InternalMode = "session" | "demo-server" | "demo-interactive";

export function internalCommand(mode: InternalMode, args: string[]): string[] {
  return [
    process.execPath,
    ...(standalone
      ? []
      : [
          "--no-env-file",
          fileURLToPath(new URL("../entry.ts", import.meta.url)),
        ]),
    "--crew-internal",
    mode,
    ...args,
  ];
}
