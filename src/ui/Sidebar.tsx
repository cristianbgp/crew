import { FocusableRow } from "./FocusableRow";
import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";

import type { CrewConfig } from "../config/types";
import type { ServiceSnapshot } from "../process/types";
import { useTheme } from "./theme";
import { Button } from "./Button";
import { serviceStatus } from "./service-status";
export function Sidebar({
  config,
  snapshots,
  selected,
  onSelect,
  onAdd,
  onClose,
  onSearch,
  onCommands,
  onGroup,
  collapsed: providedCollapsed,
  onCollapsedChange,
}: {
  collapsed?: Set<string>;
  onCollapsedChange?: (value: Set<string>) => void;
  onGroup?: (repo: string) => void;
  onCommands?: () => void;
  config: CrewConfig;
  snapshots: ServiceSnapshot[];
  selected: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onClose?: () => void;
  onSearch?: () => void;
}) {
  const c = useTheme();
  const renderer = useRenderer();
  const list = useRef<ScrollBoxRenderable | null>(null);
  const { height } = useTerminalDimensions();
  const compact = height < 22;
  const collapsed = providedCollapsed ?? new Set<string>();
  const setCollapsed = (update: (value: Set<string>) => Set<string>) =>
    onCollapsedChange?.(update(collapsed));
  const repos = [...new Set(config.services.map((s) => s.repo))];
  const summarize = (ids: string[]) => {
    const states = snapshots.filter((s) => ids.includes(s.id));
    return {
      running: states.filter((s) => s.state === "running").length,
      issues: states.filter((s) => serviceStatus(s).tone === "danger").length,
    };
  };
  const summary = summarize(config.services.map((s) => s.id));
  const collapsedKey = [...collapsed].join("\0");
  const serviceKey = config.services
    .map((s) => `${s.repo}\0${s.id}`)
    .join("\0");
  const drawer = Boolean(onClose);
  useEffect(() => {
    const reveal = () => {
      const viewport = list.current?.viewport;
      const row = selected
        ? list.current?.content.findDescendantById(`service-row-${selected}`)
        : null;
      if (
        !viewport ||
        !row ||
        (viewport.height > 0 &&
          row.y >= viewport.y &&
          row.y + row.height <= viewport.y + viewport.height)
      ) {
        renderer.off("frame", reveal);
        return;
      }
      list.current?.scrollChildIntoView(row.id);
      renderer.requestRender();
    };
    // Inspect after layout: resize and scrollbars can change the viewport.
    // Stop when visible so later manual scrolling stays untouched.
    renderer.on("frame", reveal);
    renderer.requestRender();
    return () => {
      renderer.off("frame", reveal);
    };
  }, [selected, collapsedKey, serviceKey, height, drawer, renderer]);
  return (
    <box
      id="crew-sidebar"
      width={onClose ? "100%" : 26}
      flexShrink={0}
      height="100%"
      flexDirection="column"
      backgroundColor={c.sidebar}
      paddingLeft={2}
      paddingRight={1}
      paddingTop={compact ? 0 : 1}
    >
      {onClose ? (
        <Button label="Close services · Esc" onPress={onClose} />
      ) : null}
      <box height={1} flexShrink={0} flexDirection="row" gap={1}>
        <text fg={c.accent}>
          <b>crew</b>
        </text>
        <text fg={c.muted}>{config.services.length} services</text>
      </box>
      <text fg={c.text} flexShrink={0} height={1} wrapMode="none" truncate>
        <b>{config.name}</b>
      </text>
      <text
        fg={summary.issues ? c.danger : c.muted}
        flexShrink={0}
        height={1}
        wrapMode="none"
        truncate
      >
        {summary.running}/{config.services.length} running
        {summary.issues
          ? ` · ${summary.issues} ${summary.issues === 1 ? "issue" : "issues"}`
          : ""}
      </text>
      {!compact ? <box height={1} flexShrink={0} /> : null}
      {onSearch || onCommands ? (
        <box height={1} flexShrink={0}>
          <Button
            secondary
            label="⌕ Commands · Ctrl+K"
            onPress={onCommands ?? onSearch ?? (() => {})}
          />
        </box>
      ) : null}
      {!compact ? <box height={1} flexShrink={0} /> : null}
      <scrollbox ref={list} flexGrow={1} minHeight={1} width="100%">
        {repos.map((repo) => {
          const services = config.services.filter((s) => s.repo === repo);
          const group = summarize(services.map((s) => s.id));
          return (
            <box
              key={repo}
              flexDirection="column"
              marginBottom={1}
              flexShrink={0}
            >
              <box height={1} flexShrink={0} flexDirection="row">
                <FocusableRow
                  labelId={`group-label-${repo}`}
                  grow
                  onPress={() =>
                    setCollapsed((prev) => {
                      const n = new Set(prev);
                      if (n.has(repo)) n.delete(repo);
                      else n.add(repo);
                      return n;
                    })
                  }
                >
                  <text
                    id={`group-label-${repo}`}
                    fg={c.muted}
                    flexGrow={1}
                    minWidth={0}
                    height={1}
                    wrapMode="none"
                    truncate
                  >
                    {collapsed.has(repo) ? "▸" : "▾"} {repo}
                  </text>
                  <text
                    fg={group.issues ? c.danger : c.muted}
                    height={1}
                    flexShrink={0}
                  >
                    {group.running}/{services.length}
                    {group.issues ? ` !${group.issues}` : ""}{" "}
                  </text>
                </FocusableRow>
                {onGroup ? (
                  <Button
                    quiet
                    paddingX={0}
                    label="···"
                    onPress={() => onGroup(repo)}
                  />
                ) : null}
              </box>
              {services
                .filter((s) => !collapsed.has(repo) || s.id === selected)
                .map((s) => {
                  const snapshot = snapshots.find((p) => p.id === s.id);
                  const status = serviceStatus(snapshot);
                  return (
                    <FocusableRow
                      key={s.id}
                      id={`service-row-${s.id}`}
                      labelId={`service-label-${s.id}`}
                      selected={selected === s.id}
                      paddingLeft={0}
                      onPress={() => onSelect(s.id)}
                    >
                      <text width={2} fg={c.accent}>
                        {selected === s.id ? "▎ " : "  "}
                      </text>
                      <text fg={c[status.tone]}>{status.mark} </text>
                      <text
                        id={`service-label-${s.id}`}
                        fg={selected === s.id ? c.text : c.muted}
                        flexGrow={1}
                        minWidth={0}
                        height={1}
                        wrapMode="none"
                        truncate
                      >
                        {selected === s.id ? <b>{s.id}</b> : s.id}
                      </text>
                    </FocusableRow>
                  );
                })}
            </box>
          );
        })}
        {repos.length === 0 ? <text fg={c.muted}>No services yet.</text> : null}
      </scrollbox>
      <box marginBottom={compact ? 0 : 1} height={1} flexShrink={0}>
        <Button quiet paddingX={0} label="+ Add service" onPress={onAdd} />
      </box>
    </box>
  );
}
