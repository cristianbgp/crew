import {
  saveConfig,
  type ConfigDocument,
  type ConfigMutation,
} from "../config/store";
import type { ProcessManager } from "../process/manager";
export async function applyServiceChange(
  document: ConfigDocument,
  mutation: ConfigMutation,
  manager: ProcessManager,
): Promise<ConfigDocument> {
  if (mutation.type === "remove") await manager.stop(mutation.serviceId);
  const saved = await saveConfig(document, mutation);
  manager.updateDefinitions(saved.config.services);
  return saved;
}
