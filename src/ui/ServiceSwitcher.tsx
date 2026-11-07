import { useEffect, useRef, useState } from "react";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { CrewConfig } from "../config/types";
import type { ServiceSnapshot } from "../process/types";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { inputTheme } from "./inputTheme";
import { serviceStatus } from "./service-status";
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
  selectedId,
}: {
  selectedId?: string | null;
  items?: PaletteItem[];
  initialQuery?: string;
  config: CrewConfig;
  snapshots: ServiceSnapshot[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const c = useTheme();
  const renderer = useRenderer();
  const initialIndex =
    items || initialQuery.trim()
      ? 0
      : Math.max(
          0,
          config.services.findIndex((s) => s.id === selectedId),
        );
  const queryRef = useRef(initialQuery);
  const indexRef = useRef(initialIndex);
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(initialIndex);
  const list = useRef<ScrollBoxRenderable | null>(null);
  const refocusSearch = useRef(false);
  const { width, height } = useTerminalDimensions();
  const resultGap = height < 18 ? 0 : 1;
  const entries: PaletteItem[] =
    items ??
    config.services.map((s) => {
      const status = serviceStatus(snapshots.find((p) => p.id === s.id));
      return {
        id: s.id,
        label: s.id,
        detail: `${s.repo} · ${status.mark} ${status.label}`,
        shortcut: s.id === selectedId ? "Current" : undefined,
        run: () => onSelect(s.id),
      };
    });
  const filter = (value: string) => {
    const normalized = value.trim().toLowerCase();
    const terms = normalized.split(/\s+/).filter(Boolean);
    const filtered = entries.filter((item) => {
      const text =
        `${item.label} ${item.detail} ${!items ? (config.services.find((s) => s.id === item.id)?.command ?? "") : ""}`.toLowerCase();
      return terms.every((term) => text.includes(term));
    });
    if (items || !normalized) return filtered;
    const score = (item: PaletteItem) => {
      const name = item.label.toLowerCase();
      return name === normalized ? 2 : name.startsWith(normalized) ? 1 : 0;
    };
    return filtered.sort((a, b) => score(b) - score(a));
  };
  const matches = filter(query);
  const activeIndex = Math.min(index, Math.max(0, matches.length - 1));
  useEffect(() => {
    if (index !== activeIndex) {
      indexRef.current = activeIndex;
      setIndex(activeIndex);
    }
  }, [index, activeIndex]);
  const resultIds = matches.map((item) => item.id).join("\0");
  useEffect(() => {
    const reveal = () =>
      list.current?.scrollChildIntoView(`switch-result-${activeIndex}`);
    reveal();
    renderer.once("frame", reveal);
    renderer.requestRender();
    return () => {
      renderer.off("frame", reveal);
    };
  }, [activeIndex, query, resultIds, width, height, renderer]);
  const clear = () => {
    refocusSearch.current = true;
    queryRef.current = "";
    indexRef.current = 0;
    setQuery("");
    setIndex(0);
    renderer.root.findDescendantById("service-search")?.focus();
  };
  useEffect(() => {
    if (refocusSearch.current) {
      refocusSearch.current = false;
      renderer.root.findDescendantById("service-search")?.focus();
    }
  }, [query, renderer]);
  useKeyboard((key) => {
    const candidates = filter(queryRef.current);
    const current = Math.min(
      indexRef.current,
      Math.max(0, candidates.length - 1),
    );
    if (key.name === "escape" || key.name === "f2") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
    } else if (key.ctrl && key.name === "u") {
      key.preventDefault();
      key.stopPropagation();
      clear();
    } else if (
      ["up", "down", "tab", "pageup", "pagedown"].includes(key.name) ||
      (key.ctrl && ["home", "end"].includes(key.name))
    ) {
      key.preventDefault();
      key.stopPropagation();
      if (candidates.length) {
        const page = Math.max(
          1,
          Math.floor((list.current?.height ?? 2) / (2 + resultGap)),
        );
        indexRef.current =
          key.name === "home"
            ? 0
            : key.name === "end"
              ? candidates.length - 1
              : key.name === "pageup"
                ? Math.max(0, current - page)
                : key.name === "pagedown"
                  ? Math.min(candidates.length - 1, current + page)
                  : (current +
                      (key.name === "up" || key.shift ? -1 : 1) +
                      candidates.length) %
                    candidates.length;
        setIndex(indexRef.current);
      }
    } else if (key.name === "return") {
      key.preventDefault();
      key.stopPropagation();
      candidates[current]?.run();
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
        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          <text
            fg={c.accent}
            height={1}
            flexGrow={1}
            minWidth={0}
            wrapMode="none"
            truncate
          >
            <b>{items ? "Commands" : "Switch service"}</b>
          </text>
          <text fg={c.muted} height={1} flexShrink={0}>
            {query.trim()
              ? `${matches.length} of ${entries.length}`
              : `${entries.length} ${items ? (entries.length === 1 ? "action" : "actions") : entries.length === 1 ? "service" : "services"}`}
          </text>
        </box>
        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          <input
            keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
            id="service-search"
            flexGrow={1}
            width={0}
            minWidth={1}
            focused
            placeholder={
              items
                ? "Search services or actions…"
                : "Search name, group or command…"
            }
            value={query}
            onInput={(value) => {
              queryRef.current = value;
              indexRef.current = 0;
              setQuery(value);
              setIndex(0);
            }}
            {...inputTheme(c)}
          />
          {query ? (
            <Button quiet paddingX={0} label="Clear" onPress={clear} />
          ) : null}
        </box>
        <scrollbox
          ref={list}
          flexGrow={1}
          minHeight={1}
          marginTop={1}
          marginBottom={1}
        >
          {matches.length ? (
            matches.map((service, i) => (
              <box
                id={`switch-result-${i}`}
                key={service.id}
                height={2}
                marginBottom={resultGap}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
                flexDirection="column"
                backgroundColor={i === activeIndex ? c.selected : undefined}
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
                    <text
                      fg={c.accent}
                      height={1}
                      flexShrink={0}
                      wrapMode="none"
                      truncate
                    >
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
            <box flexDirection="column" flexShrink={0}>
              <text fg={c.text}>
                {entries.length
                  ? `No matching ${items ? "actions" : "services"}.`
                  : `No ${items ? "actions" : "services"} yet.`}
              </text>
              <text fg={c.muted}>
                {query
                  ? "Try fewer words or Ctrl+U to clear."
                  : "Add a service from the workspace."}
              </text>
            </box>
          )}
        </scrollbox>
        <box
          height={1}
          flexShrink={0}
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
        >
          <text
            fg={c.muted}
            height={1}
            minWidth={0}
            flexShrink={1}
            wrapMode="none"
            truncate
          >
            {width >= 54 ? "↑↓ Choose · Enter Open" : "↑↓ Enter"}
          </text>
          <Button quiet label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
