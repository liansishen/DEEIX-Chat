"use client";

import * as React from "react";

import {
  THEME_PRESET_STORAGE_KEY,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
  THEMES,
  type Theme,
  type ThemePreset,
} from "@/shared/model/theme";
import {
  type CustomThemeConfig,
  CUSTOM_THEME_STORAGE_KEY,
  parseCustomTheme,
  serializeCustomTheme,
} from "@/shared/model/custom-theme";
import { applyThemeVariables } from "@/shared/lib/theme-resolver";
import { isOneOf } from "@/shared/lib/type-guards";

export type ThemePreviewDraft = {
  preset?: ThemePreset;
  mode?: "light" | "dark";
  customTheme?: CustomThemeConfig | null;
} | null;

export type ThemeContextValue = {
  theme: Theme;
  preset: ThemePreset;
  customTheme?: CustomThemeConfig;
  setTheme: (theme: Theme) => void;
  setPreset: (preset: ThemePreset) => void;
  commitTheme: (preset: ThemePreset, customTheme?: CustomThemeConfig | null, preservePreview?: boolean) => void;
  resolvedTheme: "light" | "dark";
  savedResolvedTheme: "light" | "dark";
  systemTheme: "light" | "dark";
  themes: Theme[];
  presets: ThemePreset[];
  // Reactive preview states
  activePreset: ThemePreset;
  activeResolvedTheme: "light" | "dark";
  activeCustomTheme?: CustomThemeConfig;
  isPreviewing: boolean;
  themeRevision: number;
  setPreviewDraft: (draft: ThemePreviewDraft) => void;
  cancelPreviewDraft: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const isTheme = isOneOf(THEMES);
const isThemePreset = isOneOf(THEME_PRESETS);

export function normalizeTheme(value: string | null | undefined): Theme {
  return isTheme(value) ? value : "system";
}

export function normalizeThemePreset(value: string | null | undefined): ThemePreset {
  return isThemePreset(value) ? value : "default";
}

function applyTheme(
  theme: Theme,
  systemTheme: "light" | "dark",
  preset: ThemePreset,
  customTheme?: CustomThemeConfig,
  forcedMode?: "light" | "dark",
) {
  if (typeof document === "undefined") return;
  const resolvedTheme = forcedMode ?? (theme === "system" ? systemTheme : theme);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
  root.dataset.theme = preset;
  root.style.colorScheme = resolvedTheme;
  const overrides = resolvedTheme === "dark" ? customTheme?.dark : customTheme?.light;
  applyThemeVariables(overrides, root);
}

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [preset, setPresetState] = React.useState<ThemePreset>("default");
  const [customTheme, setCustomThemeState] = React.useState<CustomThemeConfig | undefined>(undefined);
  const [systemTheme, setSystemTheme] = React.useState<"light" | "dark">("light");
  const [previewDraft, setPreviewDraftState] = React.useState<ThemePreviewDraft>(null);
  const [themeRevision, setThemeRevision] = React.useState<number>(0);

  const themeRef = React.useRef<Theme>("system");
  const presetRef = React.useRef<ThemePreset>("default");
  const customThemeRef = React.useRef<CustomThemeConfig | undefined>(undefined);
  const previewDraftRef = React.useRef<ThemePreviewDraft>(null);
  previewDraftRef.current = previewDraft;

  React.useEffect(() => {
    const initialSystemTheme = resolveSystemTheme();
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const storedPreset = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    const storedCustomTheme = parseCustomTheme(window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY));
    const initialTheme = normalizeTheme(storedTheme);
    const initialPreset = normalizeThemePreset(storedPreset);
    themeRef.current = initialTheme;
    presetRef.current = initialPreset;
    customThemeRef.current = storedCustomTheme;
    setThemeState(initialTheme);
    setPresetState(initialPreset);
    setCustomThemeState(storedCustomTheme);
    setSystemTheme(initialSystemTheme);
    applyTheme(initialTheme, initialSystemTheme, initialPreset, storedCustomTheme);
    setThemeRevision((r) => r + 1);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      const nextSystemTheme = resolveSystemTheme();
      setSystemTheme(nextSystemTheme);
      const curDraft = previewDraftRef.current;
      if (curDraft) {
        applyTheme(
          themeRef.current,
          nextSystemTheme,
          curDraft.preset ?? presetRef.current,
          curDraft.customTheme !== undefined ? (curDraft.customTheme ?? undefined) : customThemeRef.current,
          curDraft.mode,
        );
      } else {
        applyTheme(themeRef.current, nextSystemTheme, presetRef.current, customThemeRef.current);
      }
      setThemeRevision((r) => r + 1);
    };
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    // Follow changes made in another same-origin document (browser tabs, the
    // desktop tab strip). `storage` only fires for writes from other documents.
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== THEME_STORAGE_KEY &&
        event.key !== THEME_PRESET_STORAGE_KEY &&
        event.key !== CUSTOM_THEME_STORAGE_KEY
      ) {
        return;
      }
      const nextTheme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
      const nextPreset = normalizeThemePreset(window.localStorage.getItem(THEME_PRESET_STORAGE_KEY));
      const nextCustomTheme = parseCustomTheme(window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY));
      themeRef.current = nextTheme;
      presetRef.current = nextPreset;
      customThemeRef.current = nextCustomTheme;
      setThemeState(nextTheme);
      setPresetState(nextPreset);
      setCustomThemeState(nextCustomTheme);
      if (!previewDraftRef.current) {
        applyTheme(nextTheme, resolveSystemTheme(), nextPreset, nextCustomTheme);
        setThemeRevision((r) => r + 1);
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      themeRef.current = nextTheme;
      setThemeState(nextTheme);
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      if (!previewDraftRef.current) {
        applyTheme(nextTheme, systemTheme, presetRef.current, customThemeRef.current);
        setThemeRevision((r) => r + 1);
      }
    },
    [systemTheme],
  );

  const commitTheme = React.useCallback(
    (nextPreset: ThemePreset, nextCustomTheme?: CustomThemeConfig | null, preservePreview = false) => {
      presetRef.current = nextPreset;
      customThemeRef.current = nextCustomTheme ?? undefined;
      setPresetState(nextPreset);
      setCustomThemeState(nextCustomTheme ?? undefined);

      window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, nextPreset);
      if (nextCustomTheme && (Object.keys(nextCustomTheme.light).length > 0 || Object.keys(nextCustomTheme.dark).length > 0)) {
        window.localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, serializeCustomTheme(nextCustomTheme));
      } else {
        window.localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
      }

      if (!preservePreview) {
        setPreviewDraftState(null);
        previewDraftRef.current = null;
        applyTheme(themeRef.current, systemTheme, nextPreset, nextCustomTheme ?? undefined);
      } else if (previewDraftRef.current) {
        const draft = previewDraftRef.current;
        const effPreset = draft.preset ?? nextPreset;
        const effCustomTheme = draft.customTheme !== undefined ? (draft.customTheme ?? undefined) : (nextCustomTheme ?? undefined);
        applyTheme(themeRef.current, systemTheme, effPreset, effCustomTheme, draft.mode);
      } else {
        applyTheme(themeRef.current, systemTheme, nextPreset, nextCustomTheme ?? undefined);
      }

      setThemeRevision((r) => r + 1);
    },
    [systemTheme],
  );

  const setPreset = React.useCallback(
    (nextPreset: ThemePreset) => {
      commitTheme(nextPreset, null);
    },
    [commitTheme],
  );

  const setPreviewDraft = React.useCallback(
    (draft: ThemePreviewDraft) => {
      setPreviewDraftState(draft);
      previewDraftRef.current = draft;
      if (draft) {
        const effPreset = draft.preset ?? presetRef.current;
        const effCustomTheme = draft.customTheme !== undefined ? (draft.customTheme ?? undefined) : customThemeRef.current;
        applyTheme(themeRef.current, systemTheme, effPreset, effCustomTheme, draft.mode);
      } else {
        applyTheme(themeRef.current, systemTheme, presetRef.current, customThemeRef.current);
      }
      setThemeRevision((r) => r + 1);
    },
    [systemTheme],
  );

  const cancelPreviewDraft = React.useCallback(() => {
    setPreviewDraft(null);
  }, [setPreviewDraft]);

  const activePreset = previewDraft?.preset ?? preset;
  const activeCustomTheme = previewDraft ? (previewDraft.customTheme !== undefined ? (previewDraft.customTheme ?? undefined) : customTheme) : customTheme;
  const activeResolvedTheme = previewDraft?.mode ?? (theme === "system" ? systemTheme : theme);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      theme,
      preset,
      customTheme,
      setTheme,
      setPreset,
      commitTheme,
      resolvedTheme: activeResolvedTheme,
      savedResolvedTheme: theme === "system" ? systemTheme : theme,
      systemTheme,
      themes: [...THEMES],
      presets: [...THEME_PRESETS],
      activePreset,
      activeResolvedTheme,
      activeCustomTheme,
      isPreviewing: previewDraft !== null,
      themeRevision,
      setPreviewDraft,
      cancelPreviewDraft,
    }),
    [
      activeCustomTheme,
      activePreset,
      activeResolvedTheme,
      cancelPreviewDraft,
      commitTheme,
      customTheme,
      preset,
      previewDraft,
      setPreset,
      setPreviewDraft,
      setTheme,
      systemTheme,
      theme,
      themeRevision,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const DEFAULT_THEME_CONTEXT: ThemeContextValue = {
  theme: "system",
  preset: "default",
  setTheme: () => undefined,
  setPreset: () => undefined,
  commitTheme: () => undefined,
  resolvedTheme: "light",
  savedResolvedTheme: "light",
  systemTheme: "light",
  themes: [...THEMES],
  presets: [...THEME_PRESETS],
  activePreset: "default",
  activeResolvedTheme: "light",
  isPreviewing: false,
  themeRevision: 0,
  setPreviewDraft: () => undefined,
  cancelPreviewDraft: () => undefined,
};

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    return DEFAULT_THEME_CONTEXT;
  }
  return context;
}
