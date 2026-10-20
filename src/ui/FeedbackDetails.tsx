import { useTerminalDimensions } from "@opentui/react";
import type { RefObject } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { StatusFeedback } from "./StatusBar";
import { Button } from "./Button";
import { useTheme } from "./theme";
export function FeedbackDetails({
  feedback,
  viewport,
  onClose,
}: {
  feedback: NonNullable<StatusFeedback>;
  viewport: RefObject<ScrollBoxRenderable | null>;
  onClose: () => void;
}) {
  const c = useTheme();
  const { height } = useTerminalDimensions();
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor={c.bg}
      alignItems="center"
      justifyContent="center"
    >
      <box
        id="feedback-details"
        width="100%"
        maxWidth={90}
        height={Math.min(20, height)}
        border
        borderColor={c.line}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={c.sidebar}
        flexDirection="column"
      >
        <text fg={c.accent} flexShrink={0}>
          <b>Status details</b>
        </text>
        <scrollbox ref={viewport} flexGrow={1} minHeight={1}>
          <text fg={feedback.error ? c.danger : c.text} selectable>
            {feedback.text}
          </text>
        </scrollbox>
        <box height={1} flexShrink={0}>
          <Button quiet label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
