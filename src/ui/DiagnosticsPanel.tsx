import { useRef, useState } from "react";
import {
  useKeyboard,
  useTerminalDimensions,
  useRenderer,
} from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { Button } from "./Button";
import { menuKey, useInitialFocus } from "./focus";
import { useTheme } from "./theme";
import type { DiagnosticSection } from "../process/diagnostics";
export function DiagnosticsPanel({
  title = "Diagnostics",
  text = "",
  sections = [],
  onExport,
  onClose,
}: {
  title?: string;
  text?: string;
  sections?: DiagnosticSection[];
  onExport?: () => Promise<string>;
  onClose: () => void;
}) {
  const c = useTheme();
  const { height, width } = useTerminalDimensions();
  const renderer = useRenderer();
  const list = useRef<ScrollBoxRenderable | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useInitialFocus("crew-diagnostics");
  useKeyboard((key) => {
    if (key.name === "return" || key.name === "space") return;
    key.preventDefault();
    key.stopPropagation();
    if (key.name === "escape") onClose();
    else if (key.name === "tab")
      menuKey(
        renderer.root.findDescendantById("crew-diagnostics"),
        renderer.currentFocusedRenderable,
        key,
      );
    else if (["up", "down", "pageup", "pagedown"].includes(key.name))
      list.current?.scrollBy(
        ["up", "pageup"].includes(key.name) ? -1 : 1,
        key.name.startsWith("page") ? "viewport" : "step",
      );
  });
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={c.bg}
      alignItems="center"
      justifyContent="center"
    >
      <box
        id="crew-diagnostics"
        width="100%"
        maxWidth={90}
        height={Math.max(6, height - 1)}
        border
        borderColor={c.line}
        backgroundColor={c.sidebar}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={c.accent} height={1} flexShrink={0}>
          <b>{title}</b>
        </text>
        <scrollbox ref={list} flexGrow={1} minHeight={1}>
          {text ? (
            <text fg={sections.length ? c.yellow : c.text} selectable>
              {text}
            </text>
          ) : null}
          {sections.map((section, index) => (
            <box
              key={section.title}
              flexDirection="column"
              flexShrink={0}
              marginTop={index ? 1 : 0}
            >
              <text fg={c.accent} height={1} wrapMode="none" truncate>
                <b>{section.title}</b>
              </text>
              <text fg={c.text} selectable>
                {section.lines.join("\n")}
              </text>
            </box>
          ))}
          {message ? (
            <text fg={c.yellow} selectable>
              {message}
            </text>
          ) : null}
        </scrollbox>
        <box height={1} flexShrink={0} gap={1} flexDirection="row">
          {onExport ? (
            <Button
              label={busy ? "Exporting…" : "Export logs"}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void onExport()
                  .then((path) => {
                    setMessage(`Exported: ${path}`);
                    queueMicrotask(() =>
                      list.current?.scrollTo(list.current.scrollHeight),
                    );
                  })
                  .catch((e) => setMessage(String(e)))
                  .finally(() => setBusy(false));
              }}
            />
          ) : null}
          <Button quiet label="Close · Esc" onPress={onClose} />
          <text
            fg={c.muted}
            height={1}
            flexGrow={1}
            minWidth={0}
            wrapMode="none"
            truncate
          >
            {width >= 72 ? "↑↓ / PgUp / PgDn scroll" : "↑↓"}
          </text>
        </box>
      </box>
    </box>
  );
}
