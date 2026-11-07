import type { ReactNode } from "react";
import type { ServiceSnapshot } from "../process/types";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { serviceStatus } from "./service-status";

export function ServiceHeader({
  name,
  repo,
  snapshot,
  pending,
  compact,
  availableWidth,
  onServices,
  onOpen,
  children,
}: {
  name: string | null;
  repo: string;
  snapshot?: ServiceSnapshot;
  pending: boolean;
  compact: boolean;
  availableWidth: number;
  onServices?: () => void;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const c = useTheme();
  const { label, mark, tone } = serviceStatus(snapshot);
  const statusColor = c[tone];
  const titleWidth = Math.max(
    1,
    availableWidth -
      label.length -
      3 -
      (onServices ? 11 : 0) -
      (onOpen ? 10 : 0) -
      (pending ? 2 : 0),
  );
  return (
    <box
      id="crew-toolbar"
      flexShrink={0}
      flexDirection="column"
      paddingTop={compact ? 0 : 1}
    >
      {!compact ? (
        <text fg={c.muted} height={1} flexShrink={0} wrapMode="none" truncate>
          {repo}
        </text>
      ) : null}
      <box
        height={1}
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        gap={1}
      >
        {onServices ? <Button label="Services" onPress={onServices} /> : null}
        <text
          id="crew-service-title"
          fg={c.text}
          minWidth={1}
          maxWidth={titleWidth}
          flexShrink={1}
          height={1}
          wrapMode="none"
          truncate
        >
          <b>{name ?? "Welcome"}</b>
        </text>
        {pending ? (
          <text fg={c.yellow} flexShrink={0}>
            *
          </text>
        ) : null}
        <text
          id="crew-service-status"
          fg={statusColor}
          flexShrink={0}
          height={1}
        >
          {mark} {label}
        </text>
        {onOpen ? (
          <Button
            id="crew-open-url"
            secondary
            label="Open ↗"
            onPress={onOpen}
          />
        ) : null}
      </box>
      {children}
      {!compact ? <box height={1} flexShrink={0} /> : null}
    </box>
  );
}
