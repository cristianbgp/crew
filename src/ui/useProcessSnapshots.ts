import { useEffect, useState } from "react";
import type { ProcessManager } from "../process/manager";

export function useProcessSnapshots(manager: ProcessManager) {
  const [snapshots, setSnapshots] = useState(manager.getSnapshot);
  useEffect(() => {
    const refresh = () => setSnapshots(manager.getSnapshot());
    const unsubscribe = manager.subscribe(refresh);
    // A process can change between rendering and installing this subscription.
    refresh();
    return unsubscribe;
  }, [manager]);
  return snapshots;
}
