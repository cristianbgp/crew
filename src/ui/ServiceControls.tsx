import { Button } from "./Button";
import type { ServiceSnapshot } from "../process/types";
export type ServiceAction = "start" | "stop" | "restart";
export function ServiceControls({
  snapshot,
  operation,
  compact,
  onMore,
  onLogs,
  onStart,
  onStop,
  onRestart,
  onCopy,
}: {
  snapshot: ServiceSnapshot | undefined;
  operation?: ServiceAction;
  compact?: boolean;
  onMore?: () => void;
  onLogs?: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  // Kept for callers from the original toolbar; editing now lives in More.
  onEdit: () => void;
  onRemove: () => void;
  onCopy: () => void;
}) {
  const running = snapshot?.state === "running";
  const busy =
    Boolean(operation) ||
    snapshot?.state === "starting" ||
    snapshot?.state === "stopping";
  const cancellable =
    snapshot?.state !== "stopping" &&
    (operation === "start" ||
      operation === "restart" ||
      snapshot?.readiness === "waiting" ||
      Boolean(snapshot?.waitingFor));
  const label =
    cancellable && operation !== "stop"
      ? operation === "restart"
        ? "Cancel restart"
        : "Cancel start"
      : operation === "restart"
        ? "Restarting…"
        : operation === "start" || snapshot?.state === "starting"
          ? "Starting…"
          : operation === "stop" || snapshot?.state === "stopping"
            ? "Stopping…"
            : running
              ? "Stop"
              : "Start";
  return (
    <box
      id="crew-service-controls"
      flexDirection="row"
      gap={1}
      height={1}
      flexShrink={0}
    >
      <Button
        label={label}
        disabled={busy && (!cancellable || operation === "stop")}
        onPress={cancellable || running ? onStop : onStart}
      />
      {!compact ? (
        <Button secondary label="Restart" disabled={busy} onPress={onRestart} />
      ) : null}
      <Button secondary label="Copy" onPress={onCopy} />
      <Button
        secondary
        label={compact ? "Logs" : "Logs F4"}
        onPress={onLogs ?? (() => {})}
      />
      <Button secondary label="More" onPress={onMore ?? (() => {})} />
    </box>
  );
}
