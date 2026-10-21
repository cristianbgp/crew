import type { WorkspaceState } from "../state/workspace";
import { ShutdownScreen } from "./ShutdownScreen";
import { useState, useEffect } from "react";
import { dirname } from "node:path";
import { App } from "./App";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useRenderer } from "@opentui/react";
import { focusableChildren, menuKey } from "./focus";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { SetupWizard } from "./SetupWizard";
import { ServiceEditor } from "./ServiceEditor";
import { Button } from "./Button";
import { ThemeProvider, useTheme, type ThemePreference } from "./theme";
import { loadConfig, createConfig, type ConfigDocument } from "../config/store";
import type { ProcessManager } from "../process/manager";
import { applyServiceChange } from "./edit-service";
import { useProcessSnapshots } from "./useProcessSnapshots";
export function CrewRoot(props: CrewRootProps) {
  return (
    <ThemeProvider preference={props.theme}>
      <ThemedCrewRoot {...props} />
    </ThemeProvider>
  );
}
function ThemedCrewRoot(props: CrewRootProps) {
  const [closing, setClosing] = useState(false);
  const snapshots = useProcessSnapshots(props.manager);
  const quit = () => {
    if (closing) return;
    setClosing(true);
    props.onQuit();
  };
  return (
    <KeyboardShortcuts onQuit={quit}>
      {closing || props.manager.isShuttingDown() ? (
        <ShutdownScreen snapshots={snapshots} />
      ) : (
        <Workspace {...props} onQuit={quit} />
      )}
    </KeyboardShortcuts>
  );
}
interface CrewRootProps {
  onWorkspaceNameChange?: (name: string | null) => void;
  theme?: ThemePreference;
  initialPreferences?: WorkspaceState;
  onPreferencesChange?: (state: WorkspaceState) => void;
  initialDocument: ConfigDocument | null;
  path: string;
  manager: ProcessManager;
  onQuit: () => void;
}
function Workspace({
  initialDocument,
  path,
  manager,
  onQuit,
  initialPreferences,
  onPreferencesChange,
  onWorkspaceNameChange,
}: CrewRootProps) {
  const c = useTheme();
  const { width, height } = useTerminalDimensions();
  const compact = width < 80 || height < 22;
  const [doc, setDoc] = useState(initialDocument);
  useEffect(() => {
    onWorkspaceNameChange?.(doc?.config.name ?? null);
  }, [doc?.config.name, onWorkspaceNameChange]);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNoticeValue] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  function setNotice(message: string, error = false) {
    setNoticeValue(message);
    setNoticeError(error);
  }
  const [busy, setBusy] = useState(false);
  const snapshots = useProcessSnapshots(manager);
  const renderer = useRenderer();
  useKeyboard((key) => {
    if (removing === null) return;
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (!busy) setRemoving(null);
      return;
    }
    menuKey(
      renderer.root.findDescendantById("remove-dialog"),
      renderer.currentFocusedRenderable,
      key,
    );
  });
  useEffect(() => {
    if (removing !== null)
      focusableChildren(renderer.root.findDescendantById("remove-dialog"))
        .find((node) => node.id === "remove-cancel")
        ?.focus();
  }, [removing, renderer]);
  useEffect(() => {
    if (!notice || noticeError || removing !== null) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice, removing, noticeError]);
  async function reload() {
    const next = await loadConfig(path);
    if (!next) throw new Error("crew.toml no longer exists.");
    // Reload definitions only when removed sessions have been stopped.
    const remaining = new Set(next.config.services.map((s) => s.id));
    for (const state of manager.getSnapshot())
      if (!remaining.has(state.id)) await manager.stop(state.id);
    manager.updateDefinitions(next.config.services);
    setDoc(next);
    setEditing(null);
    setRemoving(null);
    setNotice("Configuration reloaded");
  }
  if (!doc)
    return (
      <box
        width="100%"
        height="100%"
        backgroundColor={c.bg}
        padding={compact ? 0 : 1}
        alignItems="center"
        justifyContent="center"
      >
        <SetupWizard
          baseDir={dirname(path)}
          onCancel={onQuit}
          onFinish={async (config) => {
            const next = await createConfig(path, config);
            manager.updateDefinitions(next.config.services);
            setDoc(next);
            await Promise.all(
              next.config.services
                .filter((s) => s.autostart)
                .map((s) => manager.start(s.id)),
            );
          }}
        />
      </box>
    );
  const document = doc;
  const initial =
    editing === null
      ? undefined
      : doc.config.services.find((s) => s.id === editing);
  const pending = new Set(
    doc.config.services
      .filter((s) => {
        const state = snapshots.find((p) => p.id === s.id);
        return (
          state?.state === "running" &&
          (state.runningCommand !== s.command ||
            state.runningCwd !== s.cwd ||
            JSON.stringify(state.runningReady) !== JSON.stringify(s.ready) ||
            JSON.stringify(state.runningDependsOn ?? []) !==
              JSON.stringify(s.dependsOn ?? []))
        );
      })
      .map((s) => s.id),
  );
  const dialog =
    editing !== null ? (
      <ServiceEditor
        key={editing}
        baseDir={dirname(path)}
        initial={initial}
        onCancel={() => setEditing(null)}
        onReload={reload}
        onSave={async (service) => {
          const next = await applyServiceChange(
            document,
            {
              type: initial ? "update" : "add",
              serviceId: service.id,
              service,
            },
            manager,
          );
          setDoc(next);
          setEditing(null);
          setNotice(
            initial
              ? "Saved · restart the service to apply command changes"
              : "Service added · press Start when ready",
          );
        }}
      />
    ) : removing !== null ? (
      <box
        id="remove-dialog"
        width="100%"
        maxWidth={65}
        height={Math.min(14, height - 1)}
        backgroundColor={c.sidebar}
        border
        borderColor={c.line}
        flexDirection="column"
        paddingLeft={compact ? 1 : 2}
        paddingRight={compact ? 1 : 2}
        paddingTop={compact ? 0 : 1}
        paddingBottom={compact ? 0 : 1}
      >
        <text fg={c.text} flexShrink={0} height={1} wrapMode="none" truncate>
          Remove <b>{removing}</b>?
        </text>
        <scrollbox flexGrow={1} minHeight={1}>
          <text fg={c.muted}>
            crew will stop it and remove it from crew.toml.
          </text>
          <text fg={c.danger}>{notice}</text>
        </scrollbox>
        <box
          flexDirection={width < 54 ? "column" : "row"}
          height={width < 54 ? 3 : 1}
          gap={width < 54 ? 0 : 1}
          flexShrink={0}
        >
          <Button
            label={busy ? "Removing…" : "Remove service"}
            danger
            disabled={busy}
            onPress={() => {
              setBusy(true);
              setNotice("");
              void applyServiceChange(
                document,
                { type: "remove", serviceId: removing },
                manager,
              )
                .then((next) => {
                  setDoc(next);
                  setRemoving(null);
                })
                .catch((e) => setNotice(String(e), true))
                .finally(() => setBusy(false));
            }}
          />
          <Button
            id="remove-cancel"
            label="Cancel"
            disabled={busy}
            onPress={() => setRemoving(null)}
          />
          <Button
            label="Reload file"
            disabled={busy}
            onPress={() =>
              void reload().catch((e) => setNotice(String(e), true))
            }
          />
        </box>
      </box>
    ) : null;
  return (
    <App
      initialPreferences={initialPreferences}
      onPreferencesChange={onPreferencesChange}
      config={doc.config}
      manager={manager}
      onQuit={onQuit}
      onAdd={() => {
        setNotice("");
        setEditing("");
      }}
      onEdit={(id) => {
        setNotice("");
        setEditing(id);
      }}
      onRemove={(id) => {
        setNotice("");
        setRemoving(id);
      }}
      dialog={dialog}
      notice={notice}
      noticeError={noticeError}
      pendingIds={pending}
    />
  );
}
