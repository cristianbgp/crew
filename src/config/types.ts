export type ReadyCheck = (
  | { port: number; host?: string }
  | { http: string }
  | { log: string }
) & { timeoutMs?: number };
export interface ServiceDefinition {
  id: string;
  repo: string;
  cwd: string;
  command: string;
  autostart: boolean;
  dependsOn?: string[];
  ready?: ReadyCheck;
}
export interface CrewConfig {
  name: string;
  services: ServiceDefinition[];
}
