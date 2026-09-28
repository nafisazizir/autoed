import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

const systemTheme = (): Theme => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const stored = (): Theme | null => { try { const t = localStorage.getItem("theme"); return t === "light" || t === "dark" ? t : null; } catch { return null; } };

function apply(theme: Theme) { document.documentElement.classList.toggle("dark", theme === "dark"); }

const isTypingTarget = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "light", toggle: () => {} });
export const useTheme = () => useContext(ThemeContext);

/** ziiz dark mode: the .dark class on html, following the system until the viewer picks one. D toggles it, as on ziiz.vercel.app. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => stored() ?? systemTheme());
  const setTheme = (t: Theme) => { setThemeState(t); apply(t); try { localStorage.setItem("theme", t); } catch {} };
  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => { if (!stored()) { const t = systemTheme(); setThemeState(t); apply(t); } };
    mq.addEventListener("change", onSystem);
    return () => mq.removeEventListener("change", onSystem);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== "d" || isTypingTarget(e.target)) return;
      toggle();
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}
