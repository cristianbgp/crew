import { FeedbackDetails } from "./FeedbackDetails";
import { moveFocus, focusableChildren } from "./focus";
import {
  createContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  KeyEvent,
  PasteEvent,
  Renderable,
  ScrollBoxRenderable,
} from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { ShortcutGuide } from "./ShortcutGuide";
import {
  StatusBar,
  StatusFeedbackContext,
  type StatusFeedback,
} from "./StatusBar";
import { useTheme } from "./theme";

export const ShortcutHelpContext = createContext<(() => void) | null>(null);

export function KeyboardShortcuts({
  children,
  onQuit,
}: {
  children: ReactNode;
  onQuit: () => void;
}) {
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [details, setDetails] = useState<StatusFeedback>(null);
  const active = open || Boolean(details);
  const [feedback, setFeedback] = useState<StatusFeedback>(null);
  const renderer = useRenderer();
  const guide = useRef<ScrollBoxRenderable | null>(null);
  const focusHistory = useRef<Renderable[]>([]);
  const showingHelp = useRef(open);
  showingHelp.current = active;
  useEffect(() => {
    const rememberFocus = (target: Renderable | null) => {
      if (!target || showingHelp.current) return;
      for (let node: Renderable | null = target; node; node = node.parent) {
        if (
          node.id === "shortcut-controls" ||
          node.id === "keyboard-shortcuts" ||
          node.id === "feedback-details"
        )
          return;
      }
      focusHistory.current = [
        target,
        ...focusHistory.current.filter(
          (node) => node !== target && !node.isDestroyed,
        ),
      ].slice(0, 16);
    };
    rememberFocus(renderer.currentFocusedRenderable);
    renderer.on("focused_renderable", rememberFocus);
    return () => {
      renderer.off("focused_renderable", rememberFocus);
    };
  }, [renderer]);
  useEffect(() => {
    const previous = focusHistory.current.find((node) => !node.isDestroyed);
    if (active) {
      previous?.blur();
      if (open) renderer.root.findDescendantById("shortcut-search")?.focus();
    } else previous?.focus();
  }, [active, open, renderer]);
  useEffect(() => {
    const consume = (event: KeyEvent | PasteEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const keypress = (key: KeyEvent) => {
      if (key.ctrl && !key.shift && !key.meta && key.name === "q") {
        consume(key);
        setOpen(false);
        setDetails(null);
        onQuit();
      } else if (key.name === "f1") {
        consume(key);
        setDetails(null);
        setQuery("");
        setOpen((value) => !value);
      } else if (active) {
        // Help sits over live forms and terminals. Route text directly to its
        // own native input, then consume the original event before other hooks.
        const search = renderer.currentFocusedRenderable;
        if (
          open &&
          search?.id === "shortcut-search" &&
          ![
            "escape",
            "tab",
            "up",
            "down",
            "pageup",
            "pagedown",
            "home",
            "end",
          ].includes(key.name)
        ) {
          search.handleKeyPress?.(key);
          consume(key);
          return;
        }
        consume(key);
        if (
          open &&
          ["return", "space"].includes(key.name) &&
          search?.id === "shortcut-quit"
        ) {
          setOpen(false);
          onQuit();
          return;
        }
        if (
          key.name === "escape" ||
          (["return", "space"].includes(key.name) &&
            focusableChildren(
              renderer.root.findDescendantById(
                open ? "keyboard-shortcuts" : "feedback-details",
              ),
            ).some(
              (target) =>
                target === renderer.currentFocusedRenderable &&
                target.id !== "shortcut-search",
            ))
        ) {
          setOpen(false);
          setDetails(null);
        } else if (key.name === "tab")
          moveFocus(
            renderer.root.findDescendantById(
              open ? "keyboard-shortcuts" : "feedback-details",
            ),
            renderer.currentFocusedRenderable,
            key.shift,
          );
        else if (key.name === "home") guide.current?.scrollTo(0);
        else if (key.name === "end")
          guide.current?.scrollTo(guide.current.scrollHeight);
        else if (key.name === "up") guide.current?.scrollBy(-1);
        else if (key.name === "down") guide.current?.scrollBy(1);
        else if (key.name === "pageup") guide.current?.scrollBy(-1, "viewport");
        else if (key.name === "pagedown")
          guide.current?.scrollBy(1, "viewport");
      }
    };
    const paste = (event: PasteEvent) => {
      if (active) {
        const search = renderer.currentFocusedRenderable;
        if (open && search?.id === "shortcut-search")
          search.handlePaste?.(event);
        consume(event);
      }
    };
    // Run before form hooks and the focused terminal, including when a dialog
    // is already open. Closing help must not also cancel the underlying form.
    renderer.keyInput.prependListener("keypress", keypress);
    renderer.keyInput.prependListener("paste", paste);
    return () => {
      renderer.keyInput.off("keypress", keypress);
      renderer.keyInput.off("paste", paste);
    };
  }, [renderer, open, active, onQuit]);
  const openHelp = () => {
    setDetails(null);
    setQuery("");
    setOpen(true);
  };
  return (
    <ShortcutHelpContext.Provider value={openHelp}>
      <StatusFeedbackContext.Provider value={setFeedback}>
        <box
          width="100%"
          height="100%"
          flexDirection="column"
          backgroundColor={c.bg}
        >
          <box flexGrow={1} minHeight={0}>
            {children}
          </box>
          <StatusBar
            feedback={feedback}
            onHelp={openHelp}
            onDetails={() => {
              if (feedback) {
                setOpen(false);
                setDetails(feedback);
              }
            }}
            onQuit={onQuit}
          />
          {open ? (
            <ShortcutGuide
              query={query}
              onQueryChange={setQuery}
              viewport={guide}
              onClose={() => setOpen(false)}
              onQuit={onQuit}
            />
          ) : null}
          {details ? (
            <FeedbackDetails
              feedback={details}
              viewport={guide}
              onClose={() => setDetails(null)}
            />
          ) : null}
        </box>
      </StatusFeedbackContext.Provider>
    </ShortcutHelpContext.Provider>
  );
}
