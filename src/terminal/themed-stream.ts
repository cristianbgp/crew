import type { EmbeddedTerminalRenderable } from "@opentui/core";

// Only track safe insertion boundaries. OpenTUI still owns decoding, painting,
// scrollback and selection; service bytes are forwarded without modification.
export function createThemedStream(terminal: EmbeddedTerminalRenderable) {
  let state:
    | "ground"
    | "escape"
    | "intermediate"
    | "csi"
    | "string"
    | "string-escape" = "ground";
  let osc = false;
  let utf8 = 0;
  let pending: string | undefined;
  let applied: string | undefined;
  const transparent = terminal.transparentBackground;
  function feed(byte: number) {
    if (utf8) {
      if (byte >= 0x80 && byte <= 0xbf) {
        utf8--;
        return;
      }
      utf8 = 0;
    }
    if (state === "ground" && byte >= 0x20 && byte < 0x7f) return;
    if (byte >= 0xc2 && byte <= 0xf4) {
      utf8 = byte < 0xe0 ? 1 : byte < 0xf0 ? 2 : 3;
      return;
    }
    if (byte === 0x18 || byte === 0x1a || byte === 0x9c) {
      state = "ground";
      return;
    }
    if (state === "string") {
      if (byte === 0x1b) state = "string-escape";
      else if (osc && byte === 0x07) state = "ground";
      return;
    }
    if (state === "string-escape") {
      if (byte === 0x5c) {
        state = "ground";
        return;
      }
      // An escape other than ST cancels the prior control string.
      state = "escape";
    }
    if (byte === 0x1b) {
      state = "escape";
      return;
    }
    if (byte === 0x9b) {
      state = "csi";
      return;
    }
    if ([0x90, 0x98, 0x9d, 0x9e, 0x9f].includes(byte)) {
      osc = byte === 0x9d;
      state = "string";
      return;
    }
    if (state === "escape") {
      if (byte === 0x5b) state = "csi";
      else if ([0x50, 0x58, 0x5d, 0x5e, 0x5f].includes(byte)) {
        osc = byte === 0x5d;
        state = "string";
      } else if (byte >= 0x20 && byte <= 0x2f) state = "intermediate";
      else if (byte >= 0x30 && byte <= 0x7e) state = "ground";
    } else if (state === "csi" && byte >= 0x40 && byte <= 0x7e)
      state = "ground";
    else if (state === "intermediate" && byte >= 0x30 && byte <= 0x7e)
      state = "ground";
  }
  function flush() {
    if (!pending) {
      terminal.transparentBackground = transparent;
      return;
    }
    if (state !== "ground" || utf8) {
      // Keep the previous terminal surface readable while its defaults await a
      // complete sequence, even though the surrounding UI already changed.
      terminal.transparentBackground = false;
      return;
    }
    terminal.write(pending);
    applied = pending;
    pending = undefined;
    terminal.transparentBackground = transparent;
  }
  return {
    write(bytes: Uint8Array) {
      terminal.write(bytes);
      for (const byte of bytes) feed(byte);
      flush();
    },
    setColors(foreground: string, background: string) {
      const next = `\x1b]10;${foreground}\x07\x1b]11;${background}\x07`;
      pending = next === applied ? undefined : next;
      flush();
    },
  };
}
