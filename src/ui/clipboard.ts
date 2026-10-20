import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type ClipboardService,
  type CliRenderer,
} from "@opentui/core";
export type CopyResult = "copied" | "requested";
export interface ClipboardWriter {
  writeText(text: string): Promise<CopyResult>;
  dispose?(): Promise<void>;
}
/** Prefer the OS clipboard locally; remote sessions use the terminal transport. */
export function createCrewClipboard(renderer: CliRenderer): ClipboardWriter {
  const service = createClipboard({
    host: createHostClipboard(),
    terminal: createRendererClipboardAdapter(renderer),
  });
  return {
    writeText: (text) => writeClipboard(service, text),
    dispose: () => service.dispose(),
  };
}
export async function writeClipboard(
  service: Pick<ClipboardService, "writeText">,
  text: string,
): Promise<CopyResult> {
  const result = await service.writeText(text, {
    destination: "best-available",
  });
  if (result.host.status === "written") return "copied";
  if (result.terminal.status === "attempted") return "requested";
  if (result.host.status === "failed")
    throw new Error(`Could not copy: ${result.host.error.message}`);
  throw new Error(
    "Clipboard unavailable. Your terminal could not accept the copy request.",
  );
}
