"use client";

import * as React from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Download, Moon, RotateCcw, Search, Sun, Upload } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { THEME_PRESET_ITEMS, THEME_COLOR_TOKENS, THEME_TOKEN_KEYS } from "@/shared/model/theme-presets";
import { THEME_PRESETS, type ThemePreset } from "@/shared/model/theme";
import { isOneOf } from "@/shared/lib/type-guards";
import { cn } from "@/lib/utils";
import { useTheme } from "@/shared/components/theme-provider";
import { useSettingsThemeEditor } from "@/features/settings/hooks/use-settings-theme-editor";

const isThemePreset = isOneOf(THEME_PRESETS);

const TOKEN_GROUP_ORDER = ["surface", "interactive", "controls", "content", "sidebar", "chat", "status"] as const;

// Curated list of most commonly adjusted color tokens
const COMMON_TOKEN_KEYS = [
  "background",
  "foreground",
  "primary",
  "button-primary-background",
  "chat-user-background",
  "chat-user-foreground",
  "chat-input-background",
  "sidebar",
  "sidebar-foreground",
  "link",
] as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 6) {
    const num = Number.parseInt(clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  if (clean.length === 8) {
    const num = Number.parseInt(clean.slice(0, 6), 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  return null;
}

function hexToAlpha(hex: string): number {
  const clean = hex.replace(/^#/, "");
  if (clean.length === 8) {
    const alpha = Number.parseInt(clean.slice(6, 8), 16);
    return Math.round((alpha / 255) * 100);
  }
  return 100;
}

function buildHexWithAlpha(hexBase: string, alphaPercent: number): string {
  const clean = hexBase.replace(/^#/, "").slice(0, 6);
  if (clean.length < 6) return hexBase;
  if (alphaPercent >= 100) {
    return `#${clean.toLowerCase()}`;
  }
  const alphaVal = Math.round((alphaPercent / 100) * 255);
  const alphaHex = alphaVal.toString(16).padStart(2, "0");
  return `#${clean.toLowerCase()}${alphaHex.toLowerCase()}`;
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function cssColorToHex(cssColor: string): string {
  if (!cssColor || cssColor === "transparent") return "#00000000";
  if (cssColor.startsWith("#") && (cssColor.length === 7 || cssColor.length === 9)) {
    return cssColor.toLowerCase();
  }
  if (typeof document === "undefined") return "#888888";
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return "#888888";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const rHex = r.toString(16).padStart(2, "0");
  const gHex = g.toString(16).padStart(2, "0");
  const bHex = b.toString(16).padStart(2, "0");
  if (a < 255) {
    const aHex = a.toString(16).padStart(2, "0");
    return `#${rHex}${gHex}${bHex}${aHex}`;
  }
  return `#${rHex}${gHex}${bHex}`;
}

function ColorTokenRow({
  tokenKey,
  currentValue,
  allowAlpha,
  fallbackHex,
  onColorChange,
  onReset,
}: {
  tokenKey: string;
  currentValue?: string;
  allowAlpha: boolean;
  fallbackHex: string;
  onColorChange: (color: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("settings");
  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const isOverridden = Boolean(currentValue);
  const effectiveHex = currentValue || fallbackHex || "#888888";

  const [inputDraft, setInputDraft] = React.useState(currentValue ?? "");

  React.useEffect(() => {
    setInputDraft(currentValue ?? "");
  }, [currentValue]);

  const rawRgb = hexToRgb(effectiveHex);
  const hex6 = rawRgb
    ? `#${rawRgb[0].toString(16).padStart(2, "0")}${rawRgb[1].toString(16).padStart(2, "0")}${rawRgb[2].toString(16).padStart(2, "0")}`
    : "#888888";

  const alphaPercent = hexToAlpha(effectiveHex);
  const tokenLabel = t(`generalPage.appearance.tokens.${tokenKey}`);

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHex6 = e.target.value;
    const finalHex = allowAlpha ? buildHexWithAlpha(newHex6, alphaPercent) : newHex6;
    setInputDraft(finalHex);
    onColorChange(finalHex);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputDraft(val);
    const trimmed = val.trim();
    if (trimmed.startsWith("#")) {
      if (!allowAlpha && trimmed.length === 7) {
        onColorChange(trimmed);
      } else if (allowAlpha && (trimmed.length === 7 || trimmed.length === 9)) {
        onColorChange(trimmed);
      }
    }
  };

  const handleHexBlur = () => {
    const trimmed = inputDraft.trim();
    const isValid = trimmed.startsWith("#") && (!allowAlpha ? trimmed.length === 7 : trimmed.length === 7 || trimmed.length === 9);
    if (!isValid) {
      setInputDraft(currentValue ?? "");
    }
  };

  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAlpha = Math.max(0, Math.min(100, Number.parseInt(e.target.value, 10) || 0));
    const nextVal = buildHexWithAlpha(hex6, newAlpha);
    setInputDraft(nextVal);
    onColorChange(nextVal);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5 transition-colors hover:border-ring/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground truncate" title={tokenLabel}>
            {tokenLabel}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground truncate" title={tokenKey}>
            {tokenKey}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isOverridden ? (
            <button
              type="button"
              onClick={onReset}
              title={t("generalPage.appearance.themeResetToken")}
              aria-label={t("generalPage.appearance.themeResetToken")}
              className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <RotateCcw className="size-3" />
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {t("generalPage.appearance.themePresetDefault")}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-0.5">
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="size-7 shrink-0 rounded-md border border-input/60 shadow-xs cursor-pointer overflow-hidden transition-transform hover:scale-105"
          style={{ backgroundColor: effectiveHex }}
          aria-label={t("generalPage.appearance.tokenColorPicker", { token: tokenLabel })}
        >
          <input
            ref={colorInputRef}
            type="color"
            value={hex6}
            onChange={handleNativeColorChange}
            aria-label={t("generalPage.appearance.tokenColorPicker", { token: tokenLabel })}
            className="sr-only"
            tabIndex={-1}
          />
        </button>

        <input
          type="text"
          value={inputDraft}
          placeholder={hex6}
          onChange={handleHexInputChange}
          onBlur={handleHexBlur}
          aria-label={t("generalPage.appearance.tokenHexInput", { token: tokenLabel })}
          className="h-7 min-w-0 flex-1 rounded-md border border-input/60 bg-background px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/60"
        />

        {allowAlpha ? (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground">A:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={alphaPercent}
              onChange={handleAlphaChange}
              aria-label={t("generalPage.appearance.tokenAlphaInput", { token: tokenLabel })}
              className="h-7 w-12 rounded-md border border-input/60 bg-background px-1 text-center font-mono text-xs text-foreground outline-none focus:border-ring/60"
              title="Alpha %"
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ThemeEditorSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common.actions");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const [confirmPresetChangePreset, setConfirmPresetChangePreset] = React.useState<ThemePreset | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [computedFallbacks, setComputedFallbacks] = React.useState<Record<string, string>>({});

  const { themeRevision } = useTheme();

  const {
    activeMode,
    setActiveMode,
    preset,
    setPreset,
    lightOverrides,
    darkOverrides,
    updateTokenColor,
    resetTokenColor,
    resetCurrentMode,
    resetAllToPreset,
    isSaving,
    isDirty,
    saveTheme,
    cancelEditing,
    importThemeJSON,
    exportThemeJSON,
  } = useSettingsThemeEditor(() => onOpenChange(false));

  const currentOverrides = activeMode === "light" ? lightOverrides : darkOverrides;

  // Accurately capture computed CSS variable colors from document without guessing
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const computed = window.getComputedStyle(document.documentElement);
    const nextFallbacks: Record<string, string> = {};
    for (const key of THEME_TOKEN_KEYS) {
      const raw = computed.getPropertyValue(`--${key}`).trim();
      if (raw) {
        nextFallbacks[key] = cssColorToHex(raw);
      }
    }
    setComputedFallbacks(nextFallbacks);
  }, [themeRevision, activeMode, preset]);

  const getFallbackHex = (key: string): string => {
    return computedFallbacks[key] || "#888888";
  };

  const handleRequestClose = () => {
    if (isDirty) {
      setConfirmDiscardOpen(true);
    } else {
      cancelEditing();
      onOpenChange(false);
    }
  };

  const handleConfirmDiscard = () => {
    setConfirmDiscardOpen(false);
    cancelEditing();
    onOpenChange(false);
  };

  const handlePresetSelect = (nextValue: string) => {
    if (!isThemePreset(nextValue)) return;
    const hasAnyOverrides =
      Object.keys(lightOverrides).length > 0 || Object.keys(darkOverrides).length > 0;
    if (hasAnyOverrides) {
      setConfirmPresetChangePreset(nextValue);
    } else {
      setPreset(nextValue);
    }
  };

  const handleConfirmPresetSwitch = () => {
    if (confirmPresetChangePreset) {
      setPreset(confirmPresetChangePreset);
      resetAllToPreset();
      setConfirmPresetChangePreset(null);
    }
  };

  const handleExport = () => {
    const jsonStr = exportThemeJSON();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `deeix-theme-${preset}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        importThemeJSON(content);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Contrast calculation between active text and background (WCAG AA threshold 4.5)
  const effBg = currentOverrides.background || getFallbackHex("background");
  const effFg = currentOverrides.foreground || getFallbackHex("foreground");
  const contrast = getContrastRatio(effBg, effFg);
  const isContrastLow = contrast < 4.5;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleRequestClose())} modal={false}>
        <SheetContent
          side="right"
          showOverlay={false}
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className="flex w-full flex-col p-0 sm:max-w-md md:max-w-lg lg:max-w-xl z-40 bg-popover text-popover-foreground shadow-2xl border-l border-border [&>button]:text-muted-foreground [&>button]:hover:text-foreground"
        >
          {/* Header */}
          <SheetHeader className="border-b border-border p-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-base font-semibold text-foreground">
                  {t("generalPage.appearance.customizeTheme")}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  {t("generalPage.appearance.customizeThemeDescription")}
                </SheetDescription>
              </div>
            </div>

            {/* Mode & Preset controls */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex rounded-lg bg-muted/60 p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setActiveMode("light")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    activeMode === "light"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Sun className="size-3.5" />
                  {t("generalPage.appearance.theme.light")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode("dark")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                    activeMode === "dark"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Moon className="size-3.5" />
                  {t("generalPage.appearance.theme.dark")}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {t("generalPage.appearance.themePreset")}:
                </span>
                <select
                  value={preset}
                  onChange={(e) => handlePresetSelect(e.target.value)}
                  className="h-8 rounded-md border border-input/60 bg-background px-2 text-xs text-foreground outline-none focus:border-ring/60"
                >
                  {THEME_PRESET_ITEMS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(`generalPage.appearance.preset.${item.value}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Bar (Import / Export / Reset Mode) */}
            <div className="mt-2.5 flex items-center justify-between pt-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Upload className="size-3" />
                  {t("generalPage.appearance.themeImport")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <Download className="size-3" />
                  {t("generalPage.appearance.themeExport")}
                </button>
              </div>

              <button
                type="button"
                onClick={resetCurrentMode}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("generalPage.appearance.themeResetMode")}
              </button>
            </div>

            {/* Mini Component Preview Widget */}
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("generalPage.appearance.miniPreview")}
                </span>
                {isContrastLow ? (
                  <span className="flex items-center gap-1 text-[10px] text-warning" title={t("generalPage.appearance.contrastWarning")}>
                    <AlertTriangle className="size-3" />
                    <span>{contrast.toFixed(1)}:1</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 font-mono">
                    {contrast.toFixed(1)}:1
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 rounded-md p-2.5 border border-border" style={{ backgroundColor: "var(--background)" }}>
                <div className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-1.5 text-xs shadow-xs"
                    style={{
                      backgroundColor: "var(--chat-user-background)",
                      color: "var(--chat-user-foreground)",
                    }}
                  >
                    User Message Bubble
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md px-2.5 py-1 text-xs font-medium shadow-xs"
                    style={{
                      backgroundColor: "var(--button-primary-background)",
                      color: "var(--button-primary-foreground)",
                    }}
                  >
                    Primary Button
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--button-secondary-background)",
                      color: "var(--button-secondary-foreground)",
                    }}
                  >
                    Secondary
                  </button>
                  <span className="text-xs underline" style={{ color: "var(--link)" }}>
                    Link
                  </span>
                </div>
              </div>
            </div>

            {/* Search Filter */}
            <div className="relative mt-2.5">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("generalPage.appearance.searchTokens")}
                className="h-7.5 w-full rounded-md border border-input/60 bg-background pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring/60"
              />
            </div>
          </SheetHeader>

          {/* Color Tokens Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {searchQuery ? (
              // Search Filtered View (matching both raw tokenKey and localized label)
              <div className="space-y-2">
                {Object.entries(THEME_COLOR_TOKENS)
                  .filter(([key]) => {
                    const q = searchQuery.toLowerCase();
                    const label = t(`generalPage.appearance.tokens.${key}`).toLowerCase();
                    return key.toLowerCase().includes(q) || label.includes(q);
                  })
                  .map(([key, meta]) => (
                    <ColorTokenRow
                      key={key}
                      tokenKey={key}
                      allowAlpha={meta.allowAlpha}
                      currentValue={currentOverrides[key]}
                      fallbackHex={getFallbackHex(key)}
                      onColorChange={(val) => updateTokenColor(key, val)}
                      onReset={() => resetTokenColor(key)}
                    />
                  ))}
              </div>
            ) : (
              // Common vs Advanced Categorized View
              <>
                {/* 1. Common Tokens */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-foreground tracking-wide uppercase">
                      {t("generalPage.appearance.commonColors")}
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {COMMON_TOKEN_KEYS.map((key) => {
                      const meta = THEME_COLOR_TOKENS[key];
                      if (!meta) return null;
                      return (
                        <ColorTokenRow
                          key={key}
                          tokenKey={key}
                          allowAlpha={meta.allowAlpha}
                          currentValue={currentOverrides[key]}
                          fallbackHex={getFallbackHex(key)}
                          onColorChange={(val) => updateTokenColor(key, val)}
                          onReset={() => resetTokenColor(key)}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 2. Advanced Accordion */}
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <span>{t("generalPage.appearance.advancedColors")}</span>
                    {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </button>

                  {showAdvanced ? (
                    <div className="mt-3 space-y-6">
                      {TOKEN_GROUP_ORDER.map((group) => {
                        const groupTokens = Object.entries(THEME_COLOR_TOKENS).filter(
                          ([, meta]) => meta.group === group,
                        );
                        if (groupTokens.length === 0) return null;

                        return (
                          <div key={group} className="space-y-2.5">
                            <h4 className="text-xs font-semibold text-foreground tracking-wide uppercase">
                              {t(`generalPage.appearance.themeGroup.${group}`)}
                            </h4>
                            <div className="grid grid-cols-1 gap-2">
                              {groupTokens.map(([key, meta]) => (
                                <ColorTokenRow
                                  key={key}
                                  tokenKey={key}
                                  allowAlpha={meta.allowAlpha}
                                  currentValue={currentOverrides[key]}
                                  fallbackHex={getFallbackHex(key)}
                                  onColorChange={(val) => updateTokenColor(key, val)}
                                  onReset={() => resetTokenColor(key)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="border-t border-border bg-popover p-3.5 flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground truncate">
              {isDirty ? (
                <span className="text-warning font-medium">
                  ● {t("generalPage.appearance.themeUnsaved")}
                </span>
              ) : (
                <span>{t("generalPage.appearance.themeSaved")}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={isSaving}
                className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void saveTheme()}
                disabled={isSaving || !isDirty}
                className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSaving ? tCommon("saving") : tCommon("save")}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent className="bg-popover border-border text-popover-foreground shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {t("generalPage.appearance.discardTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("generalPage.appearance.discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline">
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("generalPage.appearance.discardAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preset Switch Confirmation Dialog */}
      <AlertDialog
        open={confirmPresetChangePreset !== null}
        onOpenChange={(open) => !open && setConfirmPresetChangePreset(null)}
      >
        <AlertDialogContent className="bg-popover border-border text-popover-foreground shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">
              {t("generalPage.appearance.switchPresetTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {t("generalPage.appearance.switchPresetDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              variant="outline"
              onClick={() => setConfirmPresetChangePreset(null)}
            >
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPresetSwitch}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
