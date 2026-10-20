import type { ReadyCheck } from "../config/types";
export type ServiceState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "exited"
  | "error";
export interface ServiceSnapshot {
  id: string;
  state: ServiceState;
  exitCode: number | null;
  error: string | null;
  pid: number | null;
  generation: number;
  startedAt?: number;
  endedAt?: number;
  waitingFor?: string;
  readiness?: "waiting" | "ready" | "failed";
  runningReady?: ReadyCheck;
  runningDependsOn?: string[];
  runningCommand?: string;
  runningCwd?: string;
}
export interface OutputEvent {
  id: string;
  generation: number;
  bytes: Uint8Array;
}
