import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRenderer } from "@opentui/react";
export const theme = {
  bg: "#111318",
  sidebar: "#191c23",
  panel: "#14171e",
  hover: "#303947",
  focus: "#2d4057",
  line: "#2c313d",
  muted: "#828b9e",
  text: "#dce2ed",
  accent: "#a9c7b4",
  selected: "#2c3a34",
  danger: "#ef9296",
  yellow: "#e8c78d",
};

export const themes = {
  dark: theme,
  light: {
    bg: "#f5f6f8",
    sidebar: "#e9edf1",
    panel: "#ffffff",
    hover: "#d7dee7",
    focus: "#c9d9ed",
    line: "#cbd3dd",
    muted: "#526071",
    text: "#202833",
    accent: "#246548",
    selected: "#cbe2d3",
    danger: "#a12632",
    yellow: "#765111",
  },
};
export type ThemePreference = "auto" | "light" | "dark";
export type CrewPalette = typeof theme;
const ThemeContext = createContext<CrewPalette>(theme);
export function ThemeProvider({
  children,
  preference = "auto",
}: {
  children: ReactNode;
  preference?: ThemePreference;
}) {
  const renderer = useRenderer();
  const [detected, setDetected] = useState<"light" | "dark">(
    () => renderer.themeMode ?? "dark",
  );
  useEffect(() => {
    const changed = (mode: "light" | "dark") => setDetected(mode);
    renderer.on("theme_mode", changed);
    if (renderer.themeMode) setDetected(renderer.themeMode);
    return () => {
      renderer.off("theme_mode", changed);
    };
  }, [renderer]);
  const colors = themes[preference === "auto" ? detected : preference];
  useEffect(() => {
    renderer.setBackgroundColor(colors.bg);
  }, [renderer, colors]);
  return createElement(ThemeContext.Provider, { value: colors }, children);
}
export function useTheme() {
  return useContext(ThemeContext);
}
