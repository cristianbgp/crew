import type { ServiceSnapshot } from "../process/types";

export function serviceStatus(snapshot?: ServiceSnapshot) {
  if (snapshot?.state === "error" || snapshot?.readiness === "failed")
    return {
      label: snapshot.state === "error" ? "error" : "unready",
      mark: "!",
      tone: "danger" as const,
    };
  if (snapshot?.readiness === "waiting" || snapshot?.waitingFor)
    return { label: "waiting", mark: "◌", tone: "yellow" as const };
  const state = snapshot?.state ?? "stopped";
  return {
    label:
      state === "running" && snapshot?.readiness === "ready" ? "ready" : state,
    mark:
      state === "running"
        ? "●"
        : state === "starting" || state === "stopping"
          ? "◌"
          : state === "exited"
            ? "✓"
            : "○",
    tone:
      state === "running"
        ? ("accent" as const)
        : state === "starting" || state === "stopping"
          ? ("yellow" as const)
          : ("muted" as const),
  };
}
