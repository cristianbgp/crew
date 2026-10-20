import { useEffect, useRef, type ReactNode } from "react";
import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { useTheme } from "./theme";
export function FocusableRow({
  children,
  id,
  labelId,
  selected = false,
  paddingLeft = 0,
  grow = false,
  onPress,
}: {
  children: ReactNode;
  id?: string;
  labelId?: string;
  selected?: boolean;
  paddingLeft?: number;
  grow?: boolean;
  onPress: () => void;
}) {
  const c = useTheme();
  const ref = useRef<BoxRenderable | null>(null);
  const base = useRef(selected);
  const hovered = useRef(false);
  const repaint = useRef<() => void>(() => {});
  base.current = selected;
  useEffect(() => {
    const node = ref.current!;
    const paint = () => {
      const label = labelId
        ? (node.findDescendantById(labelId) as TextRenderable | undefined)
        : undefined;
      if (label)
        label.fg =
          node.focused || hovered.current || base.current ? c.text : c.muted;
      node.backgroundColor = node.focused
        ? c.focus
        : base.current
          ? c.selected
          : hovered.current
            ? c.hover
            : undefined;
    };
    paint();
    node.on("focused", paint);
    node.on("blurred", paint);
    repaint.current = paint;
    return () => {
      node.off("focused", paint);
      node.off("blurred", paint);
    };
  }, [selected, c, labelId]);
  return (
    <box
      ref={ref}
      id={id}
      height={1}
      flexShrink={0}
      flexGrow={grow ? 1 : 0}
      minWidth={0}
      width={grow ? 0 : undefined}
      flexDirection="row"
      paddingLeft={paddingLeft}
      focusable
      backgroundColor={selected ? c.selected : undefined}
      onMouseOver={() => {
        hovered.current = true;
        repaint.current();
      }}
      onMouseOut={() => {
        hovered.current = false;
        repaint.current();
      }}
      onMouseDown={() => onPress()}
      onKeyDown={(key) => {
        if (key.name === "return" || key.name === "space") {
          key.preventDefault();
          onPress();
        }
      }}
    >
      {children}
    </box>
  );
}
