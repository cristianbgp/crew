import { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { CrewConfig } from "../config/types";
import type { ServiceSnapshot } from "../process/types";
import { Button } from "./Button";
import { useTheme } from "./theme";
export interface PaletteItem {
  id: string;
  label: string;
  detail: string;
  shortcut?: string;
  run: () => void;
}
export function ServiceSwitcher({
  config,
  snapshots,
  onSelect,
  onClose,
  items,
  initialQuery = "",
}: {
  items?: PaletteItem[];
  initialQuery?: string;
  config: CrewConfig;
  snapshots: ServiceSnapshot[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const queryRef = useRef(initialQuery);
  const indexRef = useRef(0);
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const list = useRef<ScrollBoxRenderable | null>(null);
  const { width, height } = useTerminalDimensions();
  const entries: PaletteItem[] =
    items ??
    config.services.map((s) => ({
      id: s.id,
      label: s.id,
      detail: `${s.repo} · ${snapshots.find((p) => p.id === s.id)?.state ?? "stopped"}`,
      run: () => onSelect(s.id),
    }));
  const filter = (value: string) =>
    entries.filter((item) =>
      `${item.label} ${item.detail} ${!items ? (config.services.find((s) => s.id === item.id)?.command ?? "") : ""}`
        .toLowerCase()
        .includes(value.toLowerCase()),
    );
  const matches = filter(query);
  useEffect(() => {
    list.current?.scrollChildIntoView(`switch-result-${index}`);
  }, [index, query]);
  useKeyboard((key) => {
    const candidates = filter(queryRef.current);
    if (key.name === "escape" || key.name === "f2") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
    } else if (key.name === "up" || key.name === "down" || key.name === "tab") {
      key.preventDefault();
      key.stopPropagation();
      if (candidates.length) {
        indexRef.current =
          (indexRef.current +
            (key.name === "up" || key.shift ? -1 : 1) +
            candidates.length) %
          candidates.length;
        setIndex(indexRef.current);
      }
    } else if (key.name === "return") {
      key.preventDefault();
      key.stopPropagation();
      if (candidates[indexRef.current]) candidates[indexRef.current]!.run();
    }
  });
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={c.bg}
      justifyContent="center"
      alignItems="center"
    >
      <box
        width="100%"
        maxWidth={72}
        height={Math.min(20, height - 1)}
        border
        borderColor={c.line}
        backgroundColor={c.sidebar}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={c.accent} flexShrink={0}>
          <b>{items ? "Commands" : "Switch service"}</b>
        </text>
        <input
          keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
          id="service-search"
          focused
          placeholder={
            items
              ? "Search services or actions…"
              : "Search name, repo or command…"
          }
          value={query}
          onInput={(value) => {
            queryRef.current = value;
            indexRef.current = 0;
            setQuery(value);
            setIndex(0);
          }}
          backgroundColor={c.panel}
        />
        <scrollbox ref={list} flexGrow={1} minHeight={1}>
          {matches.length ? (
            matches.map((service, i) => (
              <box
                id={`switch-result-${i}`}
                key={service.id}
                height={2}
                flexShrink={0}
                flexDirection="column"
                backgroundColor={i === index ? c.selected : undefined}
                onMouseDown={() => service.run()}
              >
                <box height={1} flexDirection="row" gap={1}>
                  <text
                    fg={c.text}
                    height={1}
                    flexGrow={1}
                    minWidth={0}
                    wrapMode="none"
                    truncate
                  >
                    {service.label}
                  </text>
                  {service.shortcut ? (
                    <text fg={c.accent} flexShrink={0}>
                      {service.shortcut}
                    </text>
                  ) : null}
                </box>
                <text fg={c.muted} height={1} wrapMode="none" truncate>
                  {service.detail}
                </text>
              </box>
            ))
          ) : (
            <text fg={c.muted}>No matches.</text>
          )}
        </scrollbox>
        <box height={1} flexShrink={0} justifyContent="space-between">
          {width >= 54 ? (
            <text fg={c.muted}>↑↓ Choose · Enter Open</text>
          ) : null}
          <Button quiet label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
