import { useEffect, type RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useTerminalDimensions } from "@opentui/react";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { inputTheme } from "./inputTheme";

// Scope describes where crew handles the key; ordinary terminal input stays
// with the service. Keep alternatives separate so long chords remain readable.
const sections = [
  [
    "Daily essentials",
    [
      ["Ctrl+K", "Search commands & services", "Workspace"],
      ["Ctrl+Shift+P", "Open command palette", "Workspace"],
      ["F2", "Switch service", "Workspace"],
      ["F4", "Search logs", "Workspace"],
      ["F6 / Shift+F6", "Next / previous focus area", "Workspace"],
      ["Ctrl+Shift+C", "Copy selection or screen", "Terminal"],
      ["F1", "Show / hide shortcuts", "Everywhere"],
      ["Ctrl+Q", "Quit crew & stop services", "Everywhere"],
    ],
  ],
  [
    "Commands · type action, then Enter",
    [
      ["Ctrl+K → restart", "Restart service", "Workspace"],
      ["Ctrl+K → start service", "Start service", "Workspace"],
      ["Ctrl+K → stop service", "Stop service", "Workspace"],
      ["Ctrl+K → add service", "Add service", "Workspace"],
      ["Ctrl+K → edit", "Edit service", "Workspace"],
      ["Ctrl+K → diagnostics", "Inspect service diagnostics", "Workspace"],
      ["Ctrl+K → export", "Export logs", "Workspace"],
    ],
  ],
  [
    "Navigation",
    [
      ["Tab / Shift+Tab", "Next / previous control", "crew controls"],
      ["↑ / ↓", "Choose an item", "Menus"],
      ["Enter", "Activate selected item", "Menus"],
      ["Escape", "Close the current panel", "Panels"],
      ["↑↓ / PgUp / PgDn", "Scroll shortcuts", "This guide"],
      ["Home / End", "First / last shortcut", "This guide"],
    ],
  ],
  [
    "Service terminal",
    [
      ["Type / paste", "Send input to service", "Terminal"],
      ["Ctrl+C", "Copy selection; else interrupt", "Terminal"],
      ["Scroll", "Browse terminal history", "Terminal"],
      ["Drag", "Select text to copy", "Terminal"],
    ],
  ],
  [
    "Output inspector",
    [
      ["Ctrl+P", "Pause / resume output view", "Logs only"],
      ["Ctrl+End", "Follow latest output", "Logs only"],
      ["↑↓ / PgUp / PgDn", "Browse captured output", "Logs only"],
      ["Esc / F4", "Close output inspector", "Logs only"],
    ],
  ],
  [
    "Terminal & Mac notes",
    [
      ["Cmd+K", "Commands, if forwarded", "Host dependent"],
      ["Cmd+C", "Copy, if forwarded", "Host dependent"],
      ["Shift+drag", "Use Warp selection, then Cmd+C", "Warp"],
      ["Fn + F-key", "May be needed on Mac", "Keyboard"],
    ],
  ],
  [
    "Service forms",
    [
      ["Tab / Shift+Tab", "Next / previous field", "Forms"],
      ["Enter", "Next field", "Forms"],
      ["Ctrl+Enter", "Save service", "Forms"],
      ["Ctrl+A", "Select field text", "Forms"],
      ["Escape", "Cancel form", "Forms"],
    ],
  ],
] as const;

export function ShortcutGuide({
  query,
  onQueryChange,
  viewport,
  onClose,
  onQuit,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  viewport: RefObject<ScrollBoxRenderable | null>;
  onClose: () => void;
  onQuit: () => void;
}) {
  const c = useTheme();
  const { width, height } = useTerminalDimensions();
  const compact = width < 80 || height < 22;
  const wide = width >= 84;
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = sections
    .map(([title, entries]) => ({
      title,
      entries: entries.filter((entry) =>
        terms.every((term) =>
          `${title} ${entry.join(" ")}`.toLowerCase().includes(term),
        ),
      ),
    }))
    .filter((section) => section.entries.length);
  const count = matches.reduce((n, section) => n + section.entries.length, 0);
  useEffect(() => {
    viewport.current?.scrollTo(0);
  }, [query, viewport]);
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={c.bg}
      padding={compact ? 0 : 1}
      alignItems="center"
      justifyContent="center"
    >
      <box
        id="keyboard-shortcuts"
        width="100%"
        maxWidth={96}
        height={Math.max(6, Math.min(36, height - (compact ? 0 : 2)))}
        border
        borderColor={c.line}
        backgroundColor={c.sidebar}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={c.text} height={1} flexShrink={0}>
          <b>Keyboard shortcuts</b>
        </text>
        <input
          id="shortcut-search"
          value={query}
          onInput={onQueryChange}
          keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
          placeholder="Search action, key or scope…"
          {...inputTheme(c)}
        />
        {height >= 18 ? (
          <text fg={c.muted} flexShrink={0}>
            Service keys stay with your service. Use Ctrl+K for crew actions.
          </text>
        ) : null}
        <scrollbox ref={viewport} flexGrow={1} minHeight={1}>
          {!count ? (
            <text fg={c.muted}>No shortcuts found. Try “copy” or “forms”.</text>
          ) : null}
          {matches.map(({ title, entries }) => (
            <box
              key={title}
              flexDirection="column"
              marginTop={1}
              flexShrink={0}
            >
              <text fg={c.accent} height={1}>
                <b>{title}</b>
              </text>
              {entries.map(([keys, action, scope]) =>
                wide ? (
                  <box key={keys} flexDirection="row" flexShrink={0}>
                    <text width={23} fg={c.accent}>
                      {keys}
                    </text>
                    <text width={36} fg={c.text}>
                      {action}
                    </text>
                    <text fg={c.muted} flexGrow={1}>
                      {scope}
                    </text>
                  </box>
                ) : (
                  <box key={keys} flexDirection="column" flexShrink={0}>
                    <text fg={c.text}>
                      <b>{action}</b>
                    </text>
                    <text fg={c.accent}>
                      {keys}
                      <span fg={c.muted}>
                        {" · "}
                        {scope}
                      </span>
                    </text>
                  </box>
                ),
              )}
            </box>
          ))}
        </scrollbox>
        <box
          height={1}
          flexShrink={0}
          flexDirection="row"
          justifyContent="space-between"
        >
          <text fg={c.muted}>
            {width >= 60 ? `${count} shortcuts · ↑↓ scroll` : "↑↓ Scroll"}
          </text>
          <Button
            quiet
            id="shortcut-quit"
            label="Ctrl+Q Quit"
            onPress={onQuit}
          />
          <Button
            quiet
            id="shortcut-close"
            label="Esc Close"
            onPress={onClose}
          />
        </box>
      </box>
    </box>
  );
}
