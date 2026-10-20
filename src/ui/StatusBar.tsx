import { createContext, type Dispatch, type SetStateAction } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { Button } from "./Button";
import { useTheme } from "./theme";
export type StatusFeedback = { text: string; error: boolean } | null;
export const StatusFeedbackContext = createContext<Dispatch<
  SetStateAction<StatusFeedback>
> | null>(null);
export function StatusBar({
  feedback,
  onHelp,
  onQuit,
  onDetails,
}: {
  feedback: StatusFeedback;
  onHelp: () => void;
  onQuit: () => void;
  onDetails?: () => void;
}) {
  const c = useTheme();
  const { width } = useTerminalDimensions();
  return (
    <box
      id="shortcut-controls"
      height={1}
      flexShrink={0}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      gap={1}
      backgroundColor={c.sidebar}
    >
      <Button
        quiet
        label={width < 60 ? "F1 Help" : "F1 Shortcuts"}
        onPress={onHelp}
      />
      <box
        focusable={Boolean(feedback)}
        onMouseDown={() => {
          if (feedback) onDetails?.();
        }}
        onKeyDown={(key) => {
          if (feedback && key.name === "return") {
            key.preventDefault();
            onDetails?.();
          }
        }}
        flexGrow={1}
        flexShrink={1}
        width={0}
        minWidth={0}
        height={1}
      >
        <text
          width="100%"
          height={1}
          wrapMode="none"
          truncate
          fg={feedback?.error ? c.danger : c.muted}
        >
          {feedback?.text ?? ""}
        </text>
      </box>
      <Button quiet label="Ctrl+Q Quit" onPress={onQuit} />
    </box>
  );
}
