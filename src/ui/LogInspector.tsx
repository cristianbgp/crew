import { useEffect, useRef, useState } from "react";
import { stripVTControlCharacters } from "node:util";
import {
  useKeyboard,
  useRenderer,
  useTerminalDimensions,
} from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { ProcessManager } from "../process/manager";
import { Button } from "./Button";
import { moveFocus } from "./focus";
import { useTheme } from "./theme";
import { inputTheme } from "./inputTheme";
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
  function latest() {
    setPaused(false);
    setFollowing(true);
    setQuery("");
    setLines(decode());
    dirty.current = false;
  }
  useEffect(() => {
    if (following && !query) {
      const timer = setTimeout(() => {
        list.current?.scrollTo(list.current.scrollHeight);
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
      setPaused((v) => !v);
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
  const matches = lines
    .map((text, index) => ({ text, index }))
    .filter(
      (line) => !query || line.text.toLowerCase().includes(query.toLowerCase()),
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
          placeholder="Filter captured output…"
          onInput={setQuery}
          {...inputTheme(c)}
        />
        <scrollbox
          ref={list}
          flexGrow={1}
          minHeight={1}
          stickyScroll={following && !query}
          stickyStart="bottom"
          onMouseScroll={(event) => {
            if (event.scroll?.direction === "up") setFollowing(false);
          }}
        >
          <text fg={c.text} selectable>
            {matches.length
              ? matches
                  .map((line) => `${line.index + 1}  ${line.text}`)
                  .join("\n")
              : query
                ? "No matches."
                : "No output yet."}
          </text>
        </scrollbox>
        <text fg={c.muted} height={1} flexShrink={0} wrapMode="none" truncate>
          {matches.length} lines · last 5,000 lines / 1 MiB
        </text>
        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          <Button
            label={`${paused ? "Resume" : "Pause"}${width >= 72 ? " Ctrl+P" : ""}`}
            onPress={() => setPaused((v) => !v)}
          />
          <Button
            label={width >= 72 ? "Latest Ctrl+End" : "Latest"}
            onPress={latest}
          />
          <Button quiet label="Close · Esc" onPress={onClose} />
        </box>
      </box>
    </box>
  );
}
