import { useFocusCursor } from "./focus";
import { useFormFeedback } from "./useFormFeedback";
import {
  useKeyboard,
  useTerminalDimensions,
  useRenderer,
} from "@opentui/react";
import { useState, useEffect } from "react";
import { basename } from "node:path";
import type { CrewConfig, ServiceDefinition } from "../config/types";
import { ServiceEditor } from "./ServiceEditor";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { inputTheme } from "./inputTheme";
export function SetupWizard({
  baseDir,
  onFinish,
  onCancel,
}: {
  baseDir: string;
  onFinish: (config: CrewConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const c = useTheme();
  const { width, height } = useTerminalDimensions();
  const compact = width < 80 || height < 22;
  const renderer = useRenderer();
  const [focus, setFocus] = useState("workspace-name");
  const [name, setName] = useState(basename(baseDir));
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useFormFeedback(error);
  const [busy, setBusy] = useState(false);
  const [focusVersion, setFocusVersion] = useState(0);
  const targets = [
    "workspace-name",
    ...services.map((s) => "setup-remove-" + s.id),
    "setup-add",
    "setup-save",
    "setup-cancel",
  ];
  const stepFocus = useFocusCursor(targets, focus);
  useEffect(() => {
    if (!adding) renderer.root.findDescendantById(focus)?.focus();
  }, [focus, adding, renderer, focusVersion]);
  useKeyboard((key) => {
    if (adding) return;
    if (key.name === "tab") {
      key.preventDefault();
      key.stopPropagation();
      setFocusVersion((v) => v + 1);
      setFocus(stepFocus(key.shift));
      return;
    }
    if (!adding && !busy && key.name === "escape") {
      key.preventDefault();
      onCancel();
    }
  });
  if (adding)
    return (
      <ServiceEditor
        baseDir={baseDir}
        onCancel={() => setAdding(false)}
        onSave={async (service) => {
          if (services.some((s) => s.id === service.id))
            throw new Error("A service with that name already exists.");
          setServices([...services, service]);
          setAdding(false);
        }}
      />
    );
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!name.trim()) {
        setFocus("workspace-name");
        setFocusVersion((v) => v + 1);
        throw new Error("Choose a workspace name.");
      }
      await onFinish({ name: name.trim(), services });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <box
      width="100%"
      maxWidth={76}
      height={Math.max(6, Math.min(28, height - (compact ? 1 : 3)))}
      backgroundColor={c.sidebar}
      border
      borderColor={c.line}
      flexDirection="column"
      paddingLeft={width < 54 ? 0 : 2}
      paddingRight={width < 54 ? 0 : 2}
      paddingTop={compact ? 0 : 1}
      paddingBottom={compact ? 0 : 1}
    >
      <text fg={c.accent} flexShrink={0}>
        <b>crew / Create your workspace</b>
      </text>
      <scrollbox flexGrow={1} minHeight={1} marginTop={1}>
        {!compact ? (
          <>
            <text fg={c.muted} flexShrink={0}>
              Add services from this repo or other local folders.
            </text>
            <text fg={c.muted} flexShrink={0}>
              Commands run only after you choose Save & start.
            </text>
            <box height={1} flexShrink={0} />
          </>
        ) : null}
        <text fg={error && !name.trim() ? c.danger : c.muted} flexShrink={0}>
          Workspace name
        </text>
        <input
          id="workspace-name"
          onMouseDown={() => setFocus("workspace-name")}
          onSubmit={() => setFocus("setup-add")}
          keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
          value={name}
          onInput={(value) => {
            setName(value);
            if (error) setError("");
          }}
          focused={focus === "workspace-name"}
          {...inputTheme(c)}
        />
        <box height={1} flexShrink={0} />
        {!compact || services.length > 0 ? (
          <scrollbox
            height={
              compact
                ? Math.max(1, Math.min(3, services.length))
                : Math.max(2, Math.min(8, services.length * 2))
            }
            flexShrink={0}
          >
            {services.map((s) => (
              <box
                key={s.id}
                flexDirection="row"
                height={compact ? 1 : 2}
                flexShrink={0}
              >
                <text
                  fg={c.text}
                  flexGrow={1}
                  minWidth={0}
                  height={1}
                  wrapMode="none"
                  truncate
                >
                  {s.autostart ? "●" : "○"} {s.repo} / {s.id}
                  <span fg={c.muted}> {s.command}</span>
                </text>
                <box flexGrow={1} />
                <Button
                  id={`setup-remove-${s.id}`}
                  label="×"
                  onPress={() =>
                    setServices(services.filter((x) => x.id !== s.id))
                  }
                />
              </box>
            ))}
          </scrollbox>
        ) : null}
        {!compact ? (
          <box height={1} marginTop={1} flexShrink={0}>
            <Button
              id="setup-add"
              label="+ Add service"
              onPress={() => setAdding(true)}
            />
          </box>
        ) : null}

        {!compact ? (
          <text fg={c.muted} flexShrink={0}>
            {baseDir}/crew.toml
          </text>
        ) : null}
        <box height={1} flexShrink={0} />
      </scrollbox>
      {error ? (
        <text fg={c.danger} height={2} flexShrink={0}>
          {error}
        </text>
      ) : null}
      <box
        flexDirection="column"
        height={compact ? 2 : 1}
        marginTop={1}
        flexShrink={0}
      >
        {compact ? (
          <box height={1} flexShrink={0}>
            <Button
              id="setup-add"
              label="+ Add service"
              disabled={busy}
              onPress={() => setAdding(true)}
            />
          </box>
        ) : null}
        <box flexDirection="row" gap={1} height={1} flexShrink={0}>
          <Button
            id="setup-save"
            label={busy ? "Saving…" : "Save & start"}
            disabled={busy}
            onPress={() => void save()}
          />
          <Button
            id="setup-cancel"
            label="Cancel"
            onPress={onCancel}
            disabled={busy}
          />
        </box>
      </box>
    </box>
  );
}
