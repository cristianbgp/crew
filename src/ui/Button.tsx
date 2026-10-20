import { useEffect, useRef } from "react";
import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { useTheme } from "./theme";
export function Button({
  label,
  id,
  onPress,
  disabled = false,
  danger = false,
  quiet = false,
  secondary = false,
  paddingX = 1,
}: {
  label: string;
  id?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  quiet?: boolean;
  secondary?: boolean;
  paddingX?: number;
}) {
  const c = useTheme();
  const current = useRef({ disabled, danger, quiet, secondary, colors: c });
  current.current = { disabled, danger, quiet, secondary, colors: c };
  const box = useRef<BoxRenderable | null>(null);
  const text = useRef<TextRenderable | null>(null);
  const hovered = useRef(false);
  const pressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function paint() {
    if (!box.current || box.current.isDestroyed || !text.current) return;
    const { disabled, danger, quiet, secondary, colors: c } = current.current;
    box.current.backgroundColor = disabled
      ? c.panel
      : pressed.current
        ? c.accent
        : box.current.focused
          ? c.focus
          : hovered.current
            ? c.hover
            : quiet
              ? "#00000000"
              : secondary
                ? c.sidebar
                : c.line;
    text.current.fg = disabled
      ? c.muted
      : pressed.current
        ? c.bg
        : danger
          ? c.danger
          : quiet && !hovered.current && !box.current.focused
            ? c.muted
            : c.text;
  }
  useEffect(paint);
  useEffect(() => {
    const target = box.current!;
    target.on("focused", paint);
    target.on("blurred", paint);
    return () => {
      target.off("focused", paint);
      target.off("blurred", paint);
    };
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function activate() {
    if (disabled) return;
    if (timer.current) clearTimeout(timer.current);
    pressed.current = true;
    paint();
    // Keep quick clicks visible for a few terminal frames. Renderable colors
    // update directly so feedback does not rerender the surrounding terminal.
    timer.current = setTimeout(() => {
      pressed.current = false;
      paint();
    }, 180);
    onPress();
  }
  return (
    <box
      ref={box}
      id={id}
      height={1}
      maxWidth="100%"
      flexShrink={0}
      paddingLeft={paddingX}
      paddingRight={paddingX}
      backgroundColor={
        disabled
          ? c.panel
          : quiet
            ? "#00000000"
            : secondary
              ? c.sidebar
              : c.line
      }
      onMouseOver={() => {
        hovered.current = true;
        paint();
      }}
      onMouseOut={() => {
        hovered.current = false;
        paint();
      }}
      onMouseDown={(event) => {
        if (event.button === 0) activate();
      }}
      focusable={!disabled}
      onKeyDown={(key) => {
        if (!disabled && (key.name === "return" || key.name === "space")) {
          key.preventDefault();
          activate();
        }
      }}
    >
      <text
        ref={text}
        height={1}
        minWidth={0}
        wrapMode="none"
        truncate
        fg={disabled ? c.muted : danger ? c.danger : quiet ? c.muted : c.text}
      >
        {label}
      </text>
    </box>
  );
}
