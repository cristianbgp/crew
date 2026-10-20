import type { ServiceSnapshot } from "../process/types";
import { useTheme } from "./theme";
export function ShutdownScreen({
  snapshots,
}: {
  snapshots: ServiceSnapshot[];
}) {
  const c = useTheme();
  const remaining = snapshots.filter((s) => s.state !== "stopped");
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={c.bg}
      padding={1}
      flexDirection="column"
    >
      <text fg={c.accent} flexShrink={0}>
        <b>Stopping services…</b>
      </text>
      <text fg={c.muted} flexShrink={0}>
        {remaining.length} remaining · crew will close automatically.
      </text>
      <scrollbox flexGrow={1} minHeight={1} marginTop={1}>
        {remaining.map((service) => (
          <text key={service.id} fg={c.yellow}>
            {service.id} · {service.state}
          </text>
        ))}
      </scrollbox>
      <text fg={c.muted} flexShrink={0}>
        Allowing up to 5 seconds for shutdown.
      </text>
    </box>
  );
}
