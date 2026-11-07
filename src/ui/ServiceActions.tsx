import { useInitialFocus } from "./focus";
import { useTerminalDimensions } from "@opentui/react";
import type { ServiceDefinition } from "../config/types";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { useEffect, useRef, useState } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";

export function ServiceActions({
  service,
  busy,
  pending,
  onRestart,
  onEdit,
  onRemove,
  onAdd,
  onClose,
  onCommands,
  onDiagnostics,
}: {
  onCommands?: () => void;
  onDiagnostics?: () => void;
  service: ServiceDefinition;
  busy: boolean;
  pending: boolean;
  onRestart: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const c = useTheme();
  useInitialFocus("crew-service-actions");
  const { height } = useTerminalDimensions();
  const [details, setDetails] = useState(false);
  const list = useRef<ScrollBoxRenderable | null>(null);
  useEffect(() => {
    if (!details) return;
    const timer = setTimeout(
      () => list.current?.scrollChildIntoView("service-action-details"),
      0,
    );
    return () => clearTimeout(timer);
  }, [details, height]);
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
        width="100%"
        maxWidth={65}
        id="crew-service-actions"
        height={Math.min(16, height - 1)}
        border
        borderColor={c.line}
        flexDirection="column"
        backgroundColor={c.sidebar}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={c.accent} flexShrink={0} height={1} wrapMode="none" truncate>
          <b>Service actions</b> · {service.id}
        </text>
        <scrollbox ref={list} flexGrow={1} minHeight={1}>
          {pending ? (
            <text fg={c.yellow}>Changes saved · restart to apply</text>
          ) : null}
          <box height={1} flexShrink={0}>
            <Button
              label={busy ? "Working…" : "Restart"}
              disabled={busy}
              onPress={onRestart}
            />
          </box>
          <box height={1} flexShrink={0}>
            <Button label="Edit service" onPress={onEdit} />
          </box>
          {onDiagnostics ? (
            <box height={1} flexShrink={0}>
              <Button secondary label="Diagnostics" onPress={onDiagnostics} />
            </box>
          ) : null}
          {onCommands ? (
            <box height={1} flexShrink={0}>
              <Button secondary label="Commands Ctrl+K" onPress={onCommands} />
            </box>
          ) : null}
          <box height={1} flexShrink={0}>
            <Button secondary label="+ Add service" onPress={onAdd} />
          </box>
          <box height={1} flexShrink={0}>
            <Button
              secondary
              label={details ? "Hide details" : "Command & directory"}
              onPress={() => setDetails(!details)}
            />
          </box>
          {details ? (
            <box
              id="service-action-details"
              flexDirection="column"
              flexShrink={0}
            >
              <text fg={c.muted}>Group: {service.repo}</text>
              <text fg={c.accent}>Command</text>
              <text fg={c.text}>{service.command}</text>
              <text fg={c.accent}>Directory</text>
              <text fg={c.muted}>{service.cwd}</text>
            </box>
          ) : null}
          <box height={1} flexShrink={0}>
            <Button label="Remove service…" danger quiet onPress={onRemove} />
          </box>
        </scrollbox>
        <box height={1} flexShrink={0}>
          <Button label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
