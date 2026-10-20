import { ScrollBoxRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";
import { useRenderer } from "@opentui/react";
import type { Renderable, KeyEvent } from "@opentui/core";
export function focusableChildren(
  root: Renderable | null | undefined,
): Renderable[] {
  if (!root || !root.visible) return [];
  return root
    .getChildren()
    .flatMap((child) =>
      !child.visible
        ? []
        : [
            ...(child.focusable && !(child instanceof ScrollBoxRenderable)
              ? [child]
              : []),
            ...focusableChildren(child),
          ],
    );
}
export function moveFocus(
  root: Renderable | null | undefined,
  current: Renderable | null,
  backwards = false,
) {
  const nodes = focusableChildren(root);
  if (!nodes.length) return;
  const index = nodes.indexOf(current!);
  const next =
    nodes[(index + (backwards ? -1 : 1) + nodes.length) % nodes.length]!;
  next.focus();
  for (let ancestor = next.parent; ancestor; ancestor = ancestor.parent)
    if (ancestor instanceof ScrollBoxRenderable)
      ancestor.scrollChildIntoView(next.id);
}
export function useInitialFocus(id: string) {
  const renderer = useRenderer();
  useEffect(() => {
    focusableChildren(renderer.root.findDescendantById(id))[0]?.focus();
  }, [renderer, id]);
}
export function menuKey(
  root: Renderable | null | undefined,
  current: Renderable | null,
  key: KeyEvent,
) {
  if (key.name === "tab" || key.name === "up" || key.name === "down") {
    key.preventDefault();
    key.stopPropagation();
    moveFocus(root, current, key.name === "up" || key.shift);
    return true;
  }
  return false;
}

// Track actual focus changes, including repeated mouse visits, while keeping
// a synchronous cursor for several key events delivered in one terminal read.
export function useFocusCursor(ids: string[], initial: string) {
  const renderer = useRenderer();
  const cursor = useRef(initial);
  const signature = ids.join("\0");
  useEffect(() => {
    const remember = (target: Renderable | null | undefined) => {
      if (target && ids.includes(target.id)) cursor.current = target.id;
    };
    remember(renderer.currentFocusedRenderable);
    renderer.on("focused_renderable", remember);
    return () => {
      renderer.off("focused_renderable", remember);
    };
  }, [renderer, signature]);
  return (backwards = false) => {
    const index = ids.indexOf(cursor.current);
    const next = ids[(index + (backwards ? -1 : 1) + ids.length) % ids.length]!;
    cursor.current = next;
    return next;
  };
}
