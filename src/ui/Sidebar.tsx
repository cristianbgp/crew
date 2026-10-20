import { FocusableRow } from "./FocusableRow";
import { useTerminalDimensions } from "@opentui/react";

import type { CrewConfig } from "../config/types";
import type { ServiceSnapshot } from "../process/types";
import { useTheme } from "./theme";
import { Button } from "./Button";
const marks = {
  stopped: "○",
  starting: "◌",
  running: "●",
  stopping: "◌",
  exited: "✓",
  error: "!",
};
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
  const { height } = useTerminalDimensions();
  const compact = height < 22;
  const collapsed = providedCollapsed ?? new Set<string>();
  const setCollapsed = (update: (value: Set<string>) => Set<string>) =>
    onCollapsedChange?.(update(collapsed));
  const repos = [...new Set(config.services.map((s) => s.repo))];
  return (
    <box
      id="crew-sidebar"
      width={26}
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
      <scrollbox flexGrow={1} width="100%">
        {repos.map((repo) => (
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
            {!collapsed.has(repo)
              ? config.services
                  .filter((s) => s.repo === repo)
                  .map((s) => {
                    const snapshot = snapshots.find((p) => p.id === s.id);
                    const state = snapshot?.state ?? "stopped";
                    const waiting =
                      snapshot?.readiness === "waiting" || snapshot?.waitingFor;
                    const unready = snapshot?.readiness === "failed";
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
                        <text
                          fg={
                            state === "error" || unready
                              ? c.danger
                              : waiting
                                ? c.yellow
                                : state === "running"
                                  ? c.accent
                                  : c.muted
                          }
                        >
                          {unready ? "!" : waiting ? "◌" : marks[state]}{" "}
                        </text>
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
                  })
              : null}
          </box>
        ))}
        {repos.length === 0 ? <text fg={c.muted}>No services yet.</text> : null}
      </scrollbox>
      <box marginBottom={compact ? 0 : 1} height={1} flexShrink={0}>
        <Button quiet paddingX={0} label="+ Add service" onPress={onAdd} />
      </box>
    </box>
  );
}
