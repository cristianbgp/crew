import {
  EmbeddedTerminalRenderable,
  type EmbeddedTerminalOptions,
  type RenderContext,
} from "@opentui/core";

export interface ServiceTerminalOptions extends Omit<
  EmbeddedTerminalOptions,
  "onData" | "onTerminalResize"
> {
  onInput: (bytes: Uint8Array) => void;
  onResize: (cols: number, rows: number) => void;
}
/** OpenTUI owns emulation, scrollback, selection and key/paste protocol encoding. */
export function createServiceTerminal(
  ctx: RenderContext,
  options: ServiceTerminalOptions,
) {
  return new EmbeddedTerminalRenderable(ctx, {
    ...options,
    maxScrollback: 10_000,
    selectable: true,
    transparentBackground: true,
    onData: (bytes) => options.onInput(bytes),
    onTerminalResize: options.onResize,
  });
}
