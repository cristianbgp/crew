import { createThemedStream } from "../terminal/themed-stream";
import { useTheme } from "./theme";
import { useEffect, useRef } from "react";
import { EmbeddedTerminalRenderable } from "@opentui/core";
import { extend } from "@opentui/react";
import type { ProcessManager } from "../process/manager";
extend({ crewTerminal: EmbeddedTerminalRenderable });
declare module "@opentui/react" {
  interface OpenTUIComponents {
    crewTerminal: typeof EmbeddedTerminalRenderable;
  }
}
export function TerminalPane({
  id,
  active,
  enabled,
  manager,
  onFocus,
}: {
  id: string;
  active: boolean;
  enabled: boolean;
  manager: ProcessManager;
  onFocus: () => void;
}) {
  const c = useTheme();
  const ref = useRef<EmbeddedTerminalRenderable | null>(null);
  const stream = useRef<ReturnType<typeof createThemedStream> | null>(null);
  const current = useRef({ active, enabled });
  current.current = { active, enabled };
  useEffect(() => {
    const terminal = ref.current!;
    const writer = createThemedStream(terminal);
    stream.current = writer;
    writer.setColors(c.text, c.panel);
    writer.write(manager.history(id));
    const unsubscribe = manager.onOutput((e) => {
      if (e.id === id && !terminal.isDestroyed) writer.write(e.bytes);
    });
    return () => {
      unsubscribe();
      stream.current = null;
    };
  }, [id, manager]);
  useEffect(() => {
    stream.current?.setColors(c.text, c.panel);
  }, [c]);
  useEffect(() => {
    const terminal = ref.current;
    if (!terminal) return;
    if (active && enabled) {
      terminal.focus();
      manager.resize(
        id,
        Math.max(1, terminal.width),
        Math.max(1, terminal.height),
      );
    } else terminal.blur();
  }, [active, enabled, manager, id]);
  return (
    <crewTerminal
      ref={ref}
      id={`terminal-${id}`}
      width="100%"
      height="100%"
      visible={active}
      maxScrollback={10000}
      selectable
      transparentBackground={false}
      onMouseDown={onFocus}
      onData={(bytes, source) => {
        if (
          source === "response" ||
          (current.current.active && current.current.enabled)
        )
          manager.write(id, bytes);
      }}
      onTerminalResize={(cols, rows) => manager.resize(id, cols, rows)}
    />
  );
}
