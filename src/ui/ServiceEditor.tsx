import { useFocusCursor } from "./focus";
import { useFormFeedback } from "./useFormFeedback";
import { useState, useRef, useEffect } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";
import {
  useKeyboard,
  useTerminalDimensions,
  useRenderer,
} from "@opentui/react";
import { resolve, basename } from "node:path";
import { statSync } from "node:fs";
import type { ServiceDefinition } from "../config/types";
import { discoverScripts } from "../setup/discover";
import { Button } from "./Button";
import { useTheme } from "./theme";
export interface ServiceEditorProps {
  baseDir: string;
  initial?: ServiceDefinition;
  onSave: (service: ServiceDefinition) => Promise<void>;
  onCancel: () => void;
  onReload?: () => Promise<void>;
}
export function ServiceEditor({
  baseDir,
  initial,
  onSave,
  onCancel,
  onReload,
}: ServiceEditorProps) {
  const c = useTheme();
  const [values, setValues] = useState([
    initial?.id ?? "",
    initial?.repo ?? basename(baseDir),
    initial?.cwd ?? baseDir,
    initial?.command ?? "",
  ]);
  const [autostart, setAutostart] = useState(initial?.autostart ?? true);
  const [focus, setFocus] = useState(initial ? "field-1" : "field-0");
  const renderer = useRenderer();
  const [focusVersion, setFocusVersion] = useState(0);
  const [invalidField, setInvalidField] = useState<number | null>(null);
  const { width, height } = useTerminalDimensions();
  const compact = width < 80 || height < 22;
  const fields = useRef<ScrollBoxRenderable | null>(null);

  const [error, setError] = useState("");
  useFormFeedback(error);
  const [busy, setBusy] = useState(false);
  const [scripts, setScripts] = useState<{ name: string; command: string }[]>(
    [],
  );
  const labels = ["Service name", "Repo / group", "Directory", "Command"];
  const targets = [
    ...(initial ? [1, 2, 3] : [0, 1, 2, 3]).map((i) => "field-" + i),
    "service-autostart",
    "service-find",
    ...scripts.map((_, i) => "script-" + i),
    "service-save",
    "service-cancel",
    ...(onReload ? ["service-reload"] : []),
  ];
  const stepFocus = useFocusCursor(targets, focus);
  useEffect(() => {
    if (focus.startsWith("field-"))
      fields.current?.scrollChildIntoView("field-row-" + focus.slice(6));
    else if (focus === "service-autostart" || focus === "service-find")
      fields.current?.scrollChildIntoView("service-options");
    else if (focus.startsWith("script-"))
      fields.current?.scrollChildIntoView("script-choices");
    renderer.root.findDescendantById(focus)?.focus();
  }, [focus, renderer, height, width, scripts.length, focusVersion]);
  useKeyboard((key) => {
    if (
      key.name === "tab" ||
      (!renderer.currentFocusedRenderable?.id.startsWith("field-") &&
        (key.name === "up" || key.name === "down"))
    ) {
      key.preventDefault();
      key.stopPropagation();
      setFocusVersion((v) => v + 1);
      setFocus(stepFocus(key.shift || key.name === "up"));
    } else if (key.ctrl && key.name === "return") {
      key.preventDefault();
      void save();
    } else if (key.name === "escape") {
      key.preventDefault();
      if (!busy) onCancel();
    }
  });
  function change(index: number, value: string) {
    setValues((prev) => prev.map((v, i) => (i === index ? value : v)));
    if (invalidField === index) {
      setInvalidField(null);
      setError("");
    }
  }
  async function find() {
    setError("");
    try {
      const result = await discoverScripts(resolve(baseDir, values[2]!));
      setScripts(result);
      if (!result.length)
        setError("No package.json scripts found. Enter a command manually.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function save() {
    if (busy) return;
    setError("");
    const [id, repo, rawDir, command] = values;
    if (!id?.trim() || !repo?.trim() || !rawDir?.trim() || !command?.trim()) {
      const index = values.findIndex((v) => !v.trim());
      setFocusVersion((v) => v + 1);
      setInvalidField(index);
      setFocus("field-" + index);
      setError(
        [
          "Enter a service name.",
          "Enter a repo / group.",
          "Enter a directory.",
          "Enter a command.",
        ][index]!,
      );
      return;
    }
    // oxlint-disable-next-line no-control-regex -- Reject control characters before saving single-line values.
    if (/[\x00-\x1f\x7f]/.test(id + repo + rawDir)) {
      setError("Name, group and directory must be single-line.");
      return;
    }
    const cwd = resolve(baseDir, rawDir);
    try {
      if (!statSync(cwd).isDirectory()) throw new Error();
    } catch {
      setFocusVersion((v) => v + 1);
      setInvalidField(2);
      setFocus("field-2");
      setError("Directory does not exist. Choose an existing folder.");
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...(initial?.ready ? { ready: initial.ready } : {}),
        ...(initial?.dependsOn ? { dependsOn: initial.dependsOn } : {}),
        id: id.trim(),
        repo: repo.trim(),
        cwd,
        command,
        autostart,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <box
      width="100%"
      maxWidth={78}
      height={Math.max(6, Math.min(28, height - (compact ? 1 : 3)))}
      backgroundColor={c.sidebar}
      border
      borderColor={c.line}
      paddingLeft={width < 54 ? 0 : 2}
      paddingRight={width < 54 ? 0 : 2}
      paddingTop={compact ? 0 : 1}
      paddingBottom={compact ? 0 : 1}
      flexDirection="column"
    >
      <text fg={c.accent} flexShrink={0}>
        <b>{initial ? "Edit service" : "Add service"}</b>
      </text>
      {height >= 22 ? (
        <text fg={c.muted} flexShrink={0}>
          Tab between fields · Escape to cancel
        </text>
      ) : null}
      <scrollbox ref={fields} flexGrow={1} minHeight={1} marginTop={1}>
        {labels.map((label, i) => (
          <box
            key={label}
            id={`field-row-${i}`}
            flexDirection="column"
            height={3}
            flexShrink={0}
          >
            <text
              fg={
                invalidField === i
                  ? c.danger
                  : focus === `field-${i}`
                    ? c.accent
                    : c.muted
              }
            >
              {label}
              {initial && i === 0 ? " (fixed)" : ""}
            </text>
            {initial && i === 0 ? (
              <text fg={c.muted}>{values[0]}</text>
            ) : (
              <input
                keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
                id={`field-${i}`}
                width="100%"
                value={values[i]}
                focused={focus === `field-${i}`}
                backgroundColor={c.panel}
                textColor={c.text}
                focusedBackgroundColor={c.line}
                onMouseDown={() => setFocus(`field-${i}`)}
                onInput={(v) => {
                  if (!(initial && i === 0)) change(i, v);
                }}
                onSubmit={() =>
                  setFocus(i === 3 ? "service-autostart" : `field-${i + 1}`)
                }
              />
            )}
          </box>
        ))}
        <box
          id="service-options"
          flexDirection={width < 54 ? "column" : "row"}
          gap={width < 54 ? 0 : 1}
          height={width < 54 ? 2 : 1}
          flexShrink={0}
        >
          <Button
            id="service-autostart"
            label={
              autostart ? "[x] Start automatically" : "[ ] Start automatically"
            }
            onPress={() => setAutostart(!autostart)}
          />
          <Button
            id="service-find"
            label="Find scripts"
            onPress={() => void find()}
          />
        </box>
        {scripts.length ? (
          <scrollbox
            id="script-choices"
            height={Math.min(5, scripts.length)}
            flexShrink={0}
            marginTop={1}
          >
            {scripts.map((script, scriptIndex) => (
              <Button
                key={script.name}
                id={`script-${scriptIndex}`}
                label={script.name}
                onPress={() => {
                  change(3, script.command);
                  if (!values[0]) change(0, script.name);
                  setScripts([]);
                  setFocus("field-3");
                }}
              />
            ))}
          </scrollbox>
        ) : null}
      </scrollbox>
      {error ? (
        <text fg={c.danger} height={2} flexShrink={0}>
          {error}
        </text>
      ) : null}
      <box flexDirection="row" height={1} gap={1} marginTop={1} flexShrink={0}>
        <Button
          id="service-save"
          label={busy ? "Saving…" : "Save service"}
          onPress={() => void save()}
          disabled={busy}
        />
        <Button
          id="service-cancel"
          label="Cancel"
          onPress={onCancel}
          disabled={busy}
        />
        {onReload ? (
          <Button
            id="service-reload"
            label="Reload file"
            onPress={() => void onReload().catch((e) => setError(String(e)))}
            disabled={busy}
          />
        ) : null}
      </box>
    </box>
  );
}
