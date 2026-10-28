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
import { findLogMatches, formatLogOutput } from "./log-search";
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
  const list = useRef<ScrollBoxRenderable | null>(null);
  const dirty = useRef(false);
  const renderer = useRenderer();
  const { width, height } = useTerminalDimensions();
  useEffect(() => {
    const unsubscribe = manager.onOutput((e) => {
      if (e.id === id) dirty.current = true;
    });
    const timer = setInterval(() => {
      if (dirty.current && !paused) {
        dirty.current = false;
        setLines(decode());
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
    setQuery(value);
    setActive(0);
    setPaused(true);
    setFollowing(false);
  }
  function navigate(delta: number) {
    if (matches.length) {
      setActive((index) => (index + delta + matches.length) % matches.length);
    }
  }
  useEffect(() => {
    const match = matches[active];
    if (match)
      list.current?.scrollTo({
        y: Math.max(0, match.line - 2),
        x: Math.max(
          0,
          stringWidth(
            `${match.line + 1}  ${lines[match.line]!.slice(0, match.start)}`,
          ) - 5,
        ),
      });
  }, [matches, active, width, height]);
  function latest() {
    setPaused(false);
    setFollowing(true);
    currentQuery.current = "";
    setQuery("");
    setLines(decode());
    dirty.current = false;
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
      if (paused) latest();
      else setPaused(true);
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
      setFollowing(false);
      list.current?.scrollBy(
        key.name === "up" || key.name === "pageup" ? -1 : 1,
        key.name.startsWith("page") ? "viewport" : "step",
      );
    }
  });
  const output = useMemo(
    () => formatLogOutput(lines, matches, active, c),
    [lines, matches, active, c],
  );
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
        <text fg={c.accent} height={1} flexShrink={0} wrapMode="none" truncate>
          <b>Search output</b> · {id} ·{" "}
          {paused ? "paused" : following ? "following" : "history"}
        </text>
        <input
          keyBindings={[{ name: "a", ctrl: true, action: "select-all" }]}
          id="log-search"
          focused
          value={query}
          placeholder="Find in captured output…"
          onInput={search}
          {...inputTheme(c)}
        />
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
        <text fg={c.muted} height={1} flexShrink={0} wrapMode="none" truncate>
          {query
            ? matches.length
              ? `${active + 1} of ${matches.length} · Enter / Shift+Enter`
              : "No matches."
            : `${lines.length} lines · last 5,000 lines / 1 MiB`}
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
                label="↑"
                id="log-previous"
                paddingX={1}
                disabled={!matches.length}
                onPress={() => navigate(-1)}
              />
              <Button
                label="↓"
                id="log-next"
                paddingX={1}
                disabled={!matches.length}
                onPress={() => navigate(1)}
              />
            </>
          ) : null}
          <Button
            label={`${paused ? "Resume" : "Pause"}${width >= 72 ? " Ctrl+P" : ""}`}
            onPress={() => {
              if (paused) latest();
              else setPaused(true);
            }}
          />
          <Button
            label={width >= 72 ? "Latest Ctrl+End" : "Latest"}
            onPress={latest}
          />
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
