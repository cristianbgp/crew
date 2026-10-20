import { useInitialFocus } from "./focus";
import { useTerminalDimensions } from "@opentui/react";
import type { ServiceDefinition } from "../config/types";
import { Button } from "./Button";
import { useTheme } from "./theme";

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
        <scrollbox flexGrow={1} minHeight={0}>
          <text fg={c.muted}>{service.repo}</text>
          <text fg={c.text}>{service.command}</text>
          <text fg={c.muted}>{service.cwd}</text>
          {pending ? (
            <text fg={c.yellow}>Changes saved · restart to apply</text>
          ) : null}
        </scrollbox>
        <box height={1} flexShrink={0}>
          <Button
            label={busy ? "Working…" : "Restart"}
            disabled={busy}
            onPress={onRestart}
          />
        </box>
        <box height={1} flexShrink={0}>
          <Button label="Edit" onPress={onEdit} />
        </box>
        <box height={1} flexShrink={0}>
          <Button label="Remove" danger onPress={onRemove} />
        </box>
        <box height={1} flexShrink={0}>
          <Button label="+ Add service" onPress={onAdd} />
        </box>
        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          {onCommands ? (
            <Button quiet label="Commands Ctrl+K" onPress={onCommands} />
          ) : null}
          {onDiagnostics ? (
            <Button quiet label="Diagnostics" onPress={onDiagnostics} />
          ) : null}
        </box>
        <box height={1} flexShrink={0}>
          <Button label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
