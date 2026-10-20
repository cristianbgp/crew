import { useEffect, useState } from "react";
import type { ProcessManager } from "../process/manager";
import { extractUrls, plainOutput } from "../process/diagnostics";

// A live stream can stop mid-token (for example :30 followed by 00/). Only
// retain delimited URLs so provisional addresses never become the Open target.
function completedUrls(output: string) {
  return (
    plainOutput(output).match(/https?:\/\/[^\s<>"']+(?=[\s<>"'])/g) ?? []
  ).flatMap(extractUrls);
}

export function useServiceUrls(
  manager: ProcessManager,
  id: string | null,
  generation: number,
) {
  const [state, setState] = useState<{
    id: string | null;
    generation: number;
    urls: string[];
  }>({ id: null, generation: 0, urls: [] });
  useEffect(() => {
    if (!id || !manager.getSnapshot().some((snapshot) => snapshot.id === id)) {
      setState({ id, generation, urls: [] });
      return;
    }
    const decoder = new TextDecoder();
    let tail = decoder.decode(manager.history(id), { stream: true });
    const restart = tail.lastIndexOf("── Restarted ──");
    if (restart >= 0) tail = tail.slice(restart + "── Restarted ──".length);
    let urls = completedUrls(tail);
    setState({ id, generation, urls });
    tail = tail.slice(-8192);
    let dirty = false;
    const unsubscribe = manager.onOutput((event) => {
      if (event.id !== id || event.generation !== generation) return;
      tail = (tail + decoder.decode(event.bytes, { stream: true })).slice(
        -8192,
      );
      dirty = true;
    });
    const timer = setInterval(() => {
      if (!dirty) return;
      dirty = false;
      const found = completedUrls(tail);
      const next = [...new Set([...urls, ...found])].slice(-12);
      if (next.join("\n") !== urls.join("\n")) {
        urls = next;
        setState({ id, generation, urls });
      }
    }, 150);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [manager, id, generation]);
  return state.id === id && state.generation === generation ? state.urls : [];
}
