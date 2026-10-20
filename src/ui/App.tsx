import { ShortcutHelpContext } from "./KeyboardShortcuts";
import { ServiceHeader } from "./ServiceHeader";
import { useServiceUrls } from "./useServiceUrls";
import type { WorkspaceState } from "../state/workspace";
import { describeService, exportLogs, openUrl } from "../process/diagnostics";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import type { PaletteItem } from "./ServiceSwitcher";
import { createCrewClipboard, type ClipboardWriter } from "./clipboard";
import {
  useEffect,
  useState,
  useMemo,
  useRef,
  useContext,
  type ReactNode,
} from "react";
import {
  useRenderer,
  useTerminalDimensions,
  useKeyboard,
  useSelectionHandler,
} from "@opentui/react";
import type { CrewConfig } from "../config/types";
import type { ProcessManager } from "../process/manager";
import { ServiceActions } from "./ServiceActions";
import { ServiceSwitcher } from "./ServiceSwitcher";
import { LogInspector } from "./LogInspector";
import { focusableChildren, menuKey, moveFocus } from "./focus";
import { StatusFeedbackContext } from "./StatusBar";
import { Sidebar } from "./Sidebar";
import { TerminalPane } from "./TerminalPane";
import { ServiceControls, type ServiceAction } from "./ServiceControls";
import { Button } from "./Button";
import { useTheme } from "./theme";
export interface AppProps {
  initialPreferences?: WorkspaceState;
  onPreferencesChange?: (state: WorkspaceState) => void;
  openExternal?: (url: string) => Promise<void>;
  config: CrewConfig;
  manager: ProcessManager;
  onQuit: () => void;
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  dialog?: ReactNode;
  notice?: string;
  noticeError?: boolean;
  pendingIds?: Set<string>;
  clipboard?: ClipboardWriter;
}
export function App({
  initialPreferences,
  onPreferencesChange,
  openExternal = openUrl,
  onQuit,
  config,
  manager,
  onAdd,
  onEdit,
  onRemove,
  dialog,
  notice,
  noticeError,
  pendingIds,
  clipboard: providedClipboard,
}: AppProps) {
  const c = useTheme();
  const [selected, setSelected] = useState<string | null>(
    config.services.some((s) => s.id === initialPreferences?.selected)
      ? initialPreferences!.selected
      : (config.services[0]?.id ?? null),
  );
  const [collapsed, setCollapsed] = useState(
    () => new Set(initialPreferences?.collapsed ?? []),
  );
  useEffect(() => {
    onPreferencesChange?.({ selected, collapsed: [...collapsed] });
  }, [selected, collapsed, onPreferencesChange]);
  const [paletteQuery, setPaletteQuery] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [groupReport, setGroupReport] = useState<string | null>(null);
  const [groupProgress, setGroupProgress] = useState("");
  const groupBusy = useRef(false);
  const [snapshots, setSnapshots] = useState(manager.getSnapshot);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [operations, setOperations] = useState<Record<string, ServiceAction>>(
    {},
  );
  const operationIds = useRef(new Set<string>());
  const operationTokens = useRef(new Map<string, symbol>());
  const [terminalFocus, setTerminalFocus] = useState(true);
  const [error, setError] = useState("");
  const [errorTone, setErrorTone] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{
    id: string;
    sourceId?: string;
  } | null>(null);
  const completedSelection = useRef<{ id: string; text: string } | null>(null);
  const { width, height } = useTerminalDimensions();
  const renderer = useRenderer();
  const clipboard = useMemo(
    () => providedClipboard ?? createCrewClipboard(renderer),
    [providedClipboard, renderer],
  );
  useEffect(
    () => () => {
      if (!providedClipboard) void clipboard.dispose?.().catch(() => {});
    },
    [clipboard, providedClipboard],
  );
  const narrow = width < 80;
  const compact = narrow || height < 22;
  const drawerOpen = narrow && sidebarOpen;
  const hasDialog =
    Boolean(dialog) ||
    drawerOpen ||
    moreOpen ||
    switcherOpen ||
    logsOpen ||
    paletteQuery !== null ||
    diagnostics ||
    groupReport !== null;
  const openCommands = (query = "") => {
    setSidebarOpen(false);
    setMoreOpen(false);
    setLogsOpen(false);
    setSwitcherOpen(false);
    setDiagnostics(false);
    setGroupReport(null);
    setPaletteQuery(query);
  };
  const openSwitcher = () => {
    setPaletteQuery(null);
    setDiagnostics(false);
    setGroupReport(null);
    setSidebarOpen(false);
    setMoreOpen(false);
    setLogsOpen(false);
    setSwitcherOpen(true);
  };
  const interaction = useRef({ selected, hasDialog });
  interaction.current = { selected, hasDialog };
  useEffect(() => {
    setError("");
    setErrorTone(false);
    setExportMessage("");
  }, [selected]);
  useEffect(() => {
    if (!error || errorTone) return;
    const timer = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(timer);
  }, [error, errorTone]);
  useEffect(() => {
    completedSelection.current = null;
  }, [selected, hasDialog]);
  useEffect(() => {
    if (!hasDialog) setTerminalFocus(true);
  }, [hasDialog]);
  useEffect(() => {
    if (!narrow) setSidebarOpen(false);
  }, [narrow, compact]);
  useEffect(() => {
    if (drawerOpen)
      focusableChildren(
        renderer.root.findDescendantById("crew-sidebar"),
      )[0]?.focus();
  }, [drawerOpen, renderer]);
  useEffect(
    () => manager.subscribe(() => setSnapshots(manager.getSnapshot())),
    [manager],
  );
  useEffect(() => {
    if (!config.services.some((s) => s.id === selected))
      setSelected(config.services[0]?.id ?? null);
  }, [config.services, selected]);
  const service = config.services.find((s) => s.id === selected);
  const snapshot = snapshots.find((s) => s.id === selected);
  const urls = useServiceUrls(
    manager,
    snapshot ? selected : null,
    snapshot?.generation ?? 0,
  );
  const primaryUrl =
    urls.find((url) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname),
    ) ?? urls[0];
  const setStatusFeedback = useContext(StatusFeedbackContext);
  const openHelp = useContext(ShortcutHelpContext);
  const feedback =
    snapshot?.error ||
    (noticeError ? notice : "") ||
    groupProgress ||
    error ||
    notice ||
    "";
  const feedbackIsError =
    Boolean(snapshot?.error) ||
    (Boolean(error) && errorTone) ||
    Boolean(noticeError);
  useEffect(() => {
    setStatusFeedback?.(
      feedback ? { text: feedback, error: feedbackIsError } : null,
    );
  }, [setStatusFeedback, feedback, feedbackIsError, hasDialog]);
  useEffect(
    () => () => {
      setStatusFeedback?.(null);
    },
    [setStatusFeedback],
  );
  const operation = selected ? operations[selected] : undefined;
  const act = (kind: ServiceAction) => {
    if (
      !service ||
      (operationIds.current.has(service.id) &&
        (kind !== "stop" || operations[service.id] === "stop"))
    )
      return;
    const id = service.id;
    const token = Symbol(kind);
    operationTokens.current.set(id, token);
    const control = renderer.currentFocusedRenderable;
    completedSelection.current = null;
    setError("");
    setErrorTone(false);
    operationIds.current.add(id);
    setOperations((previous) => ({ ...previous, [id]: kind }));
    void manager[kind](id)
      .catch((e) => {
        if (
          operationTokens.current.get(id) === token &&
          interaction.current.selected === id
        ) {
          setErrorTone(true);
          setError(String(e));
        }
      })
      .finally(() => {
        if (operationTokens.current.get(id) !== token) return;
        operationTokens.current.delete(id);
        operationIds.current.delete(id);
        setOperations((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        setFocusRequest({ id, sourceId: control?.id });
      });
  };
  function select(id: string) {
    setSelected(id);
    setTerminalFocus(true);
    setSidebarOpen(false);
    queueMicrotask(() =>
      renderer.root.findDescendantById(`terminal-${id}`)?.focus(),
    );
  }
  function activeTerminal() {
    return (
      selected ? renderer.root.findDescendantById(`terminal-${selected}`) : null
    ) as import("@opentui/core").EmbeddedTerminalRenderable | null;
  }
  useEffect(() => {
    if (!focusRequest || focusRequest.id !== selected || hasDialog) return;
    const current = renderer.currentFocusedRenderable;
    if (
      !current ||
      current.id === focusRequest.sourceId ||
      focusableChildren(
        renderer.root.findDescendantById("crew-toolbar"),
      ).includes(current)
    )
      activeTerminal()?.focus();
  }, [focusRequest, selected, hasDialog, renderer]);
  useSelectionHandler(() => {
    const text = activeTerminal()?.getSelectedText();
    completedSelection.current =
      selected && text ? { id: selected, text } : null;
  });
  async function copy() {
    const copiedId = selected;
    const copySourceId = renderer.currentFocusedRenderable?.id;
    const term = activeTerminal();
    // Capture before the mouse click clears OpenTUI's selection.
    const selection =
      term?.getSelectedText() ||
      (completedSelection.current?.id === selected
        ? completedSelection.current.text
        : "");
    const text = selection || term?.screen().text || "";
    try {
      if (!text) {
        setErrorTone(false);
        setError("Nothing to copy");
        return;
      }
      const result = await clipboard.writeText(text);
      if (interaction.current.selected !== copiedId) return;
      setErrorTone(false);
      setError(
        result === "copied"
          ? `Copied ${selection ? "selection" : "visible output"} to clipboard`
          : "Copy requested from terminal",
      );
    } catch (error) {
      if (interaction.current.selected !== copiedId) return;
      setErrorTone(true);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (copiedId) setFocusRequest({ id: copiedId, sourceId: copySourceId });
    }
  }

  function notify(text: string, failure = false) {
    setErrorTone(failure);
    setError(text);
  }
  function groupAction(kind: ServiceAction, repo: string) {
    if (groupBusy.current) return;
    groupBusy.current = true;
    setPaletteQuery(null);
    void manager
      .group(kind, repo, (done, total) =>
        setGroupProgress(`${repo}: ${kind} ${done}/${total}`),
      )
      .then((results) => {
        const failures = results.filter((r) => r.error);
        const message = `${repo}: ${results.length - failures.length}/${results.length} succeeded`;
        notify(message, failures.length > 0);
        if (failures.length)
          setGroupReport(
            message +
              "\n\n" +
              results.map((r) => `${r.id}: ${r.error ?? "OK"}`).join("\n"),
          );
      })
      .catch((e) => notify(String(e), true))
      .finally(() => {
        groupBusy.current = false;
        setGroupProgress("");
      });
  }
  const commandItems: PaletteItem[] = [
    {
      id: "switch-service",
      label: "Switch service",
      detail: "Find by name, repository or command",
      shortcut: "F2",
      run: openSwitcher,
    },
    ...(openHelp
      ? [
          {
            id: "shortcuts",
            label: "Keyboard shortcuts",
            detail: "Search keys, actions and scopes",
            shortcut: "F1",
            run: () => {
              setPaletteQuery(null);
              openHelp();
            },
          },
        ]
      : []),
    ...config.services.map((s) => ({
      id: `switch:${s.id}`,
      label: `Switch to ${s.id}`,
      detail: s.repo,
      run: () => {
        setPaletteQuery(null);
        select(s.id);
      },
    })),
    ...(service
      ? [
          ...(["start", "stop", "restart"] as const)
            .filter((kind) =>
              kind === "stop"
                ? operation !== "stop"
                : !operationIds.current.has(service.id),
            )
            .map((kind) => ({
              id: kind,
              label: `${kind[0]!.toUpperCase()}${kind.slice(1)} service`,
              detail: service.id,
              run: () => {
                setPaletteQuery(null);
                act(kind);
              },
            })),
          {
            id: "logs",
            label: "Search logs",
            shortcut: "F4",
            detail: service.id,
            run: () => {
              setPaletteQuery(null);
              setLogsOpen(true);
            },
          },
          {
            id: "diagnostics",
            label: "Diagnostics",
            detail: service.id,
            run: () => {
              setPaletteQuery(null);
              setDiagnostics(true);
            },
          },
          {
            id: "export",
            label: "Export logs",
            detail: service.id,
            run: () => {
              setPaletteQuery(null);
              setDiagnostics(true);
              setExportMessage("Exporting…");
              void exportLogs(service, snapshot, manager.history(service.id))
                .then((path) => {
                  setExportMessage(`Exported: ${path}`);
                  notify(`Exported: ${path}`);
                })
                .catch((e) => {
                  setExportMessage(String(e));
                  notify(String(e), true);
                });
            },
          },
          {
            id: "edit",
            label: "Edit service",
            detail: service.id,
            run: () => {
              setPaletteQuery(null);
              setTerminalFocus(false);
              onEdit?.(service.id);
            },
          },
          ...urls.flatMap((url, i) => [
            {
              id: `open:${i}`,
              label: "Open URL",
              detail: url,
              run: () => {
                setPaletteQuery(null);
                void openExternal(url)
                  .then(() => notify(`Opened ${url}`))
                  .catch((e) => notify(String(e), true));
              },
            },
            {
              id: `copy:${i}`,
              label: "Copy URL",
              detail: url,
              run: () => {
                setPaletteQuery(null);
                void clipboard
                  .writeText(url)
                  .then((result) =>
                    notify(
                      result === "copied"
                        ? `Copied ${url}`
                        : "Copy requested from terminal",
                    ),
                  )
                  .catch((e) => notify(String(e), true));
              },
            },
          ]),
        ]
      : []),
    ...(!groupBusy.current
      ? [...new Set(config.services.map((s) => s.repo))].flatMap((repo) =>
          (["start", "stop", "restart"] as const).map((kind) => ({
            id: `${kind}:${repo}`,
            label: `${kind[0]!.toUpperCase()}${kind.slice(1)} group`,
            detail: repo,
            run: () => groupAction(kind, repo),
          })),
        )
      : []),
    {
      id: "add",
      label: "Add service",
      detail: config.name,
      run: () => {
        setPaletteQuery(null);
        setTerminalFocus(false);
        onAdd?.();
      },
    },
    {
      id: "quit",
      label: "Quit crew",
      shortcut: "Ctrl+Q",
      detail: "Stop all services and close",
      run: onQuit,
    },
  ];
  useKeyboard((key) => {
    const paletteKey =
      (key.name === "k" && (key.ctrl || key.super)) ||
      (key.name === "p" && key.ctrl && key.shift);
    if (!dialog && paletteKey) {
      key.preventDefault();
      key.stopPropagation();
      if (paletteQuery === null) openCommands();
      else setPaletteQuery(null);
      return;
    }
    if (!dialog && !switcherOpen && key.name === "f2") {
      key.preventDefault();
      key.stopPropagation();
      openSwitcher();
      return;
    }
    if (!dialog && !logsOpen && key.name === "f4" && selected) {
      key.preventDefault();
      key.stopPropagation();
      setSidebarOpen(false);
      setMoreOpen(false);
      setSwitcherOpen(false);
      setPaletteQuery(null);
      setDiagnostics(false);
      setGroupReport(null);
      setLogsOpen(true);
      return;
    }
    if (!dialog && (drawerOpen || moreOpen)) {
      const panel = renderer.root.findDescendantById(
        drawerOpen ? "crew-sidebar" : "crew-service-actions",
      );
      if (menuKey(panel, renderer.currentFocusedRenderable, key)) return;
      if (key.name === "return" || key.name === "space") return;
      key.preventDefault();
      key.stopPropagation();
      if (key.name === "escape") {
        setSidebarOpen(false);
        setMoreOpen(false);
      }
      return;
    }
    if (!hasDialog && key.name === "f6") {
      key.preventDefault();
      key.stopPropagation();
      const sidebar = focusableChildren(
        renderer.root.findDescendantById("crew-sidebar"),
      );
      const toolbar = focusableChildren(
        renderer.root.findDescendantById("crew-toolbar"),
      );
      const groups = [activeTerminal(), sidebar[0], toolbar[0]].filter(Boolean);
      if (!groups.length) {
        focusableChildren(renderer.root)[0]?.focus();
        return;
      }
      const current = renderer.currentFocusedRenderable;
      const index = groups.findIndex(
        (target) =>
          target === current ||
          (target === sidebar[0] && sidebar.includes(current!)) ||
          (target === toolbar[0] && toolbar.includes(current!)),
      );
      groups[
        (index + (key.shift ? -1 : 1) + groups.length) % groups.length
      ]?.focus();
      return;
    }
    if (
      !hasDialog &&
      ["up", "down"].includes(key.name) &&
      focusableChildren(
        renderer.root.findDescendantById("crew-sidebar"),
      ).includes(renderer.currentFocusedRenderable!)
    ) {
      menuKey(
        renderer.root.findDescendantById("crew-sidebar"),
        renderer.currentFocusedRenderable,
        key,
      );
      return;
    }
    if (
      !hasDialog &&
      key.name === "tab" &&
      renderer.currentFocusedRenderable !== activeTerminal()
    ) {
      key.preventDefault();
      key.stopPropagation();
      moveFocus(renderer.root, renderer.currentFocusedRenderable, key.shift);
      return;
    }
    if (hasDialog || !terminalFocus || key.name !== "c") return;
    const explicitCopy = (key.ctrl && key.shift) || key.super;
    if (!explicitCopy && !(key.ctrl && activeTerminal()?.hasSelection()))
      return;
    key.preventDefault();
    key.stopPropagation();
    void copy();
  });
  useKeyboard((key) => {
    if (!hasDialog && terminalFocus && !key.defaultPrevented)
      completedSelection.current = null;
  });
  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={c.bg}
    >
      <box flexGrow={1} flexDirection="row">
        {!narrow ? (
          <Sidebar
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            onCommands={() => openCommands()}
            onGroup={(repo) => openCommands(`group ${repo}`)}
            config={config}
            snapshots={snapshots}
            selected={selected}
            onSearch={openSwitcher}
            onSelect={select}
            onAdd={() => {
              setTerminalFocus(false);
              onAdd?.();
            }}
          />
        ) : null}
        <box
          flexGrow={1}
          minWidth={0}
          flexDirection="column"
          paddingLeft={compact ? 1 : 2}
          paddingRight={compact ? 1 : 2}
        >
          <ServiceHeader
            name={selected}
            repo={service?.repo ?? config.name}
            snapshot={snapshot}
            pending={Boolean(selected && pendingIds?.has(selected))}
            compact={compact}
            availableWidth={width - (narrow ? 0 : 26) - (compact ? 2 : 4)}
            onServices={narrow ? () => setSidebarOpen(!sidebarOpen) : undefined}
            onOpen={
              primaryUrl
                ? () => {
                    const id = selected;
                    const sourceId = renderer.currentFocusedRenderable?.id;
                    void openExternal(primaryUrl)
                      .then(() => {
                        if (interaction.current.selected === id)
                          notify(`Opened ${primaryUrl}`);
                      })
                      .catch((e) => {
                        if (interaction.current.selected === id)
                          notify(String(e), true);
                      })
                      .finally(() => {
                        if (id) setFocusRequest({ id, sourceId });
                      });
                  }
                : undefined
            }
          >
            {service ? (
              <box flexDirection="column" height={1} flexShrink={0}>
                <ServiceControls
                  snapshot={snapshot}
                  compact={compact}
                  operation={operation}
                  onLogs={() => setLogsOpen(true)}
                  onMore={() => setMoreOpen(true)}
                  onStart={() => act("start")}
                  onStop={() => act("stop")}
                  onRestart={() => act("restart")}
                  onEdit={() => {
                    setTerminalFocus(false);
                    onEdit?.(service.id);
                  }}
                  onRemove={() => {
                    setTerminalFocus(false);
                    onRemove?.(service.id);
                  }}
                  onCopy={() => void copy()}
                />
              </box>
            ) : null}
          </ServiceHeader>
          <box flexGrow={1} minHeight={1} backgroundColor={c.panel}>
            {config.services.map((s) => (
              <TerminalPane
                key={s.id}
                id={s.id}
                manager={manager}
                active={s.id === selected}
                enabled={terminalFocus && !hasDialog}
                onFocus={() => {
                  completedSelection.current = null;
                  setTerminalFocus(true);
                }}
              />
            ))}
            {!service ? (
              <box flexDirection="column" padding={2} gap={1}>
                <text fg={c.text}>Your services, one workspace.</text>
                <text fg={c.muted}>
                  Add a command from this repo or any local folder.
                </text>
                <Button label="+ Add service" onPress={() => onAdd?.()} />
              </box>
            ) : null}
          </box>
          {!setStatusFeedback && feedback ? (
            <box height={1} flexShrink={0}>
              <text fg={feedbackIsError ? c.danger : c.muted}>{feedback}</text>
            </box>
          ) : null}
        </box>
      </box>
      {drawerOpen && !dialog ? (
        <box
          position="absolute"
          left={0}
          top={0}
          width="100%"
          height="100%"
          onMouseDown={() => setSidebarOpen(false)}
        >
          <box height="100%" onMouseDown={(event) => event.stopPropagation()}>
            <Sidebar
              collapsed={collapsed}
              onCollapsedChange={setCollapsed}
              onCommands={() => openCommands()}
              onGroup={(repo) => openCommands(`group ${repo}`)}
              config={config}
              snapshots={snapshots}
              selected={selected}
              onSelect={select}
              onClose={() => setSidebarOpen(false)}
              onSearch={openSwitcher}
              onAdd={() => {
                setSidebarOpen(false);
                setTerminalFocus(false);
                onAdd?.();
              }}
            />
          </box>
        </box>
      ) : null}
      {moreOpen && service && !dialog ? (
        <ServiceActions
          service={service}
          onCommands={() => openCommands()}
          onDiagnostics={() => {
            setMoreOpen(false);
            setDiagnostics(true);
          }}
          busy={
            Boolean(operation) ||
            snapshot?.state === "starting" ||
            snapshot?.state === "stopping"
          }
          pending={Boolean(pendingIds?.has(service.id))}
          onRestart={() => {
            setMoreOpen(false);
            act("restart");
          }}
          onEdit={() => {
            setMoreOpen(false);
            setTerminalFocus(false);
            onEdit?.(service.id);
          }}
          onRemove={() => {
            setMoreOpen(false);
            setTerminalFocus(false);
            onRemove?.(service.id);
          }}
          onAdd={() => {
            setMoreOpen(false);
            setTerminalFocus(false);
            onAdd?.();
          }}
          onClose={() => setMoreOpen(false)}
        />
      ) : null}
      {switcherOpen && !dialog ? (
        <ServiceSwitcher
          config={config}
          snapshots={snapshots}
          onSelect={(id) => {
            setSwitcherOpen(false);
            select(id);
          }}
          onClose={() => setSwitcherOpen(false)}
        />
      ) : null}
      {paletteQuery !== null && !dialog ? (
        <ServiceSwitcher
          config={config}
          snapshots={snapshots}
          items={commandItems}
          initialQuery={paletteQuery}
          onSelect={select}
          onClose={() => setPaletteQuery(null)}
        />
      ) : null}
      {diagnostics && service && !dialog ? (
        <DiagnosticsPanel
          text={
            (exportMessage ? exportMessage + "\n\n" : "") +
            describeService(service, snapshot)
          }
          onExport={() =>
            exportLogs(service, snapshot, manager.history(service.id))
          }
          onClose={() => setDiagnostics(false)}
        />
      ) : null}
      {groupReport !== null && !dialog ? (
        <DiagnosticsPanel
          title="Group results"
          text={groupReport}
          onClose={() => setGroupReport(null)}
        />
      ) : null}
      {logsOpen && selected && !dialog ? (
        <LogInspector
          id={selected}
          manager={manager}
          onClose={() => setLogsOpen(false)}
        />
      ) : null}
      {dialog ? (
        <box
          position="absolute"
          left={0}
          top={0}
          width="100%"
          height="100%"
          backgroundColor={c.bg}
          padding={compact ? 0 : 1}
          alignItems="center"
          justifyContent="center"
        >
          {dialog}
        </box>
      ) : null}
    </box>
  );
}
