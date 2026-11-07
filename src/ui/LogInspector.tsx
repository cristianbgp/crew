import { useEffect, useMemo, useRef, useState } from "react";
import { stripVTControlCharacters } from "node:util";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import { stringWidth } from "bun";
import type { ProcessManager } from "../process/manager";
import { Button } from "./Button";
import { moveFocus } from "./focus";
import { useTheme } from "./theme";
import { inputTheme } from "./inputTheme";
import { findLogMatches, formatLogOutput, logContextSizes } from "./log-search";
export function LogInspector({
  id,
  manager,
  onClose,
}: {
  id: string;
  manager: ProcessManager;
  onClose: () => void;
}) {
  const c = useTheme();
  const decode = () =>
    stripVTControlCharacters(new TextDecoder().decode(manager.history(id)))
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .slice(-5000);
  const [lines, setLines] = useState(decode);
  const [query, setQuery] = useState("");
  const currentQuery = useRef("");
  const [active, setActive] = useState(0);
  const matches = useMemo(() => findLogMatches(lines, query), [lines, query]);
  const [paused, setPaused] = useState(false);
  const [following, setFollowing] = useState(true);
  const [onlyMatches, setOnlyMatches] = useState(true);
  const [contextLines, setContextLines] = useState<number>(3);
  const [newOutput, setNewOutput] = useState(false);
  const list = useRef<ScrollBoxRenderable | null>(null);
  const dirty = useRef(false);
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  const resultMode = Boolean(query) && onlyMatches;
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(0, matches.length - 1)));
  }, [matches.length]);
  const output = useMemo(
    () =>
      formatLogOutput(lines, matches, activeIndex, c, {
        onlyMatches: resultMode,
        columns: Math.max(10, Math.min(width, 110) - 6),
        contextLines,
      }),
    [lines, matches, activeIndex, c, resultMode, width, contextLines],
  );
  useEffect(() => {
    const unsubscribe = manager.onOutput((e) => {
      if (e.id === id) dirty.current = true;
    });
    const timer = setInterval(() => {
      if (dirty.current) {
        dirty.current = false;
        if (paused) setNewOutput(true);
        else setLines(decode());
      }
    }, 150);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [manager, id, paused]);
  function search(value: string) {
    // Controlled input updates also emit onInput; only user edits pause output.
    if (value === currentQuery.current) return;
    currentQuery.current = value;
    if (!value) {
      latest();
      return;
    }
    if (!paused) refresh();
    setQuery(value);
    setActive(0);
    setPaused(true);
    setFollowing(false);
  }
  function navigate(delta: number) {
    if (matches.length) {
      setActive(
        (index) =>
          (Math.min(index, matches.length - 1) + delta + matches.length) %
          matches.length,
      );
    }
  }
  useEffect(() => {
    const match = matches[activeIndex];
    if (!match) return;
    const scrollToMatch = () => {
      const viewport = list.current;
      if (!viewport || viewport.isDestroyed) return;
      const matchEnd = stringWidth(
        `${match.line + 1}  ${lines[match.line]!.slice(0, match.end)}`,
      );
      viewport.scrollTo({
        y: Math.max(
          0,
          output.rows.indexOf(match.line) -
            Math.min(
              contextLines,
              Math.max(0, Math.floor(((list.current?.height ?? 3) - 1) / 2)),
            ),
        ),
        x:
          resultMode || matchEnd <= viewport.viewport.width
            ? 0
            : Math.max(
                0,
                stringWidth(
                  `${match.line + 1}  ${lines[match.line]!.slice(0, match.start)}`,
                ) - 5,
              ),
      });
    };
    scrollToMatch();
    // A view switch changes the scroll range. Reposition after native layout,
    // rather than clamping a distant source line against the filtered list.
    renderer.once("frame", scrollToMatch);
    renderer.requestRender();
    return () => {
      renderer.off("frame", scrollToMatch);
    };
  }, [
    matches,
    activeIndex,
    output,
    resultMode,
    width,
    height,
    contextLines,
    renderer,
  ]);
  function reveal() {
    setOnlyMatches(false);
    setFollowing(false);
    setPaused(true);
  }
  function refresh() {
    setLines(decode());
    setNewOutput(false);
    dirty.current = false;
  }
  function togglePause() {
    if (paused) {
      refresh();
      setFollowing(!query);
    }
    setPaused(!paused);
  }
  function latest() {
    setPaused(false);
    setFollowing(true);
    currentQuery.current = "";
    setQuery("");
    setOnlyMatches(true);
    setActive(0);
    refresh();
  }
  useEffect(() => {
    if (following && !query) {
      const timer = setTimeout(() => {
        list.current?.scrollTo({ x: 0, y: list.current.scrollHeight });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [lines, following, query]);
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "f4") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
      return;
    }
    if (key.ctrl && key.name === "f") {
      key.preventDefault();
      key.stopPropagation();
      renderer.root.findDescendantById("log-search")?.focus();
      return;
    }
    if (key.ctrl && key.name === "o" && query) {
      key.preventDefault();
      key.stopPropagation();
      reveal();
      return;
    }
    if (
      key.name === "return" &&
      renderer.currentFocusedRenderable?.id === "log-search"
    ) {
      key.preventDefault();
      key.stopPropagation();
      navigate(key.shift ? -1 : 1);
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      key.stopPropagation();
      moveFocus(
        renderer.root.findDescendantById("log-inspector"),
        renderer.currentFocusedRenderable,
        key.shift,
      );
      return;
    }
    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      togglePause();
      return;
    }
    if (key.ctrl && key.name === "end") {
      key.preventDefault();
      key.stopPropagation();
      latest();
      return;
    }
    if (["up", "down", "pageup", "pagedown"].includes(key.name)) {
      key.preventDefault();
      key.stopPropagation();
      if (
        query &&
        ["up", "down"].includes(key.name) &&
        renderer.currentFocusedRenderable?.id === "log-search"
      ) {
        navigate(key.name === "up" ? -1 : 1);
        return;
      }
      setFollowing(false);
      list.current?.scrollBy(
        key.name === "up" || key.name === "pageup" ? -1 : 1,
        key.name.startsWith("page") ? "viewport" : "step",
      );
    }
  });
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
        id="log-inspector"
        width="100%"
        maxWidth={110}
        height={height - 1}
        border
        borderColor={c.line}
        flexDirection="column"
        backgroundColor={c.sidebar}
        paddingLeft={1}
        paddingRight={1}
      >
        <box height={1} flexShrink={0} flexDirection="row">
          <text
            fg={c.accent}
            height={1}
            flexGrow={1}
            minWidth={0}
            wrapMode="none"
            truncate
          >
            <b>Search output</b> · {id} ·{" "}
            {paused
              ? "paused"
              : query
                ? "live"
                : following
                  ? "following"
                  : "history"}
          </text>
          {newOutput ? (
            <Button
              id="log-refresh"
              label={width < 60 ? "Refresh" : "Refresh new output"}
              onPress={refresh}
            />
          ) : null}
        </box>
        <box height={1} flexShrink={0} flexDirection="row">
          <input
            keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
            id="log-search"
            flexGrow={1}
            minWidth={1}
            focused
            value={query}
            placeholder={
              width >= 72 ? "Find text in retained output…" : "Find text…"
            }
            onInput={search}
            {...inputTheme(c)}
          />
          {query ? (
            <Button id="log-clear" label="Clear" quiet onPress={latest} />
          ) : null}
        </box>
        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          {query ? (
            <>
              <Button
                label="Matches"
                id="log-filter-matches"
                selected={onlyMatches}
                secondary
                onPress={() => setOnlyMatches(true)}
              />
              <Button
                label={onlyMatches ? "Reveal" : "All output"}
                id="log-filter-all"
                selected={!onlyMatches}
                secondary
                disabled={!matches.length}
                onPress={reveal}
              />
              <Button
                id="log-context"
                label={`Context ${contextLines}`}
                secondary
                disabled={!onlyMatches}
                onPress={() =>
                  setContextLines(
                    (value) =>
                      logContextSizes[
                        (logContextSizes.indexOf(
                          value as (typeof logContextSizes)[number],
                        ) +
                          1) %
                          logContextSizes.length
                      ]!,
                  )
                }
              />
            </>
          ) : (
            <text
              fg={c.muted}
              flexGrow={1}
              minWidth={0}
              height={1}
              wrapMode="none"
              truncate
            >
              Retained output · {lines.length} lines
            </text>
          )}
        </box>
        {query && !matches.length ? (
          <box
            flexGrow={1}
            minHeight={1}
            flexDirection="column"
            justifyContent="center"
            paddingLeft={1}
          >
            <text fg={c.text}>No matches.</text>
            <text fg={c.muted}>Try a shorter search or Clear.</text>
          </box>
        ) : (
          <scrollbox
            ref={list}
            scrollX
            flexGrow={1}
            minHeight={1}
            stickyScroll={following && !query}
            stickyStart="bottom"
            onMouseScroll={(event) => {
              if (event.scroll?.direction === "up") setFollowing(false);
            }}
          >
            <text
              id="log-output"
              fg={c.text}
              selectable
              wrapMode="none"
              width={lines.some(Boolean) ? output.columns : 14}
              flexShrink={0}
              content={lines.some(Boolean) ? output.text : "No output yet."}
            />
          </scrollbox>
        )}
        <text fg={c.muted} height={1} flexShrink={0} wrapMode="none" truncate>
          {query
            ? matches.length
              ? `${activeIndex + 1} of ${matches.length} · ${resultMode ? `±${contextLines} lines` : "full output"}${width >= 72 ? " · Enter / Shift+Enter · Ctrl+O reveal" : ""}`
              : "0 matches · retained output"
            : `Last 5,000 lines / 1 MiB${paused ? " · snapshot" : ""}`}
        </text>
        <box
          height={1}
          flexShrink={0}
          flexDirection="row"
          gap={width < 60 ? 0 : 1}
        >
          {query ? (
            <>
              <Button
                label={width < 60 ? "Prev" : "Previous"}
                id="log-previous"
                paddingX={1}
                disabled={!matches.length}
                onPress={() => navigate(-1)}
              />
              <Button
                label="Next"
                id="log-next"
                paddingX={1}
                disabled={!matches.length}
                onPress={() => navigate(1)}
              />
            </>
          ) : null}
          <Button label={paused ? "Resume" : "Pause"} onPress={togglePause} />
          <Button label="Latest" onPress={latest} />
          <Button
            quiet
            label={width < 60 ? "Esc" : "Close · Esc"}
            onPress={onClose}
          />
        </box>
      </box>
    </box>
  );
}
