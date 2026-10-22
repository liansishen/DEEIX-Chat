"use client";

import * as React from "react";
import { Monitor, Moon, Palette, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { FontSizeOption } from "@/features/settings/utils/font-size";
import { TOAST_POSITIONS, type ToastPosition } from "@/shared/lib/toast-position";
import type {
  FontSizePreview,
  ThemeMode,
} from "@/features/settings/types/settings";
import { THEME_PRESET_ITEMS, type ThemePresetItem, type ThemePreviewPalette } from "@/shared/model/theme-presets";
import { cn } from "@/lib/utils";
import type { ThemePreset } from "@/shared/model/theme";
import { SettingsSection } from "@/shared/components/settings-layout";
import { dispatchOpenThemeEditor } from "@/features/settings/events/theme-editor-events";

const THEME_PRESET_PREVIEWS: readonly ThemePresetItem[] = THEME_PRESET_ITEMS;

const FONT_SIZE_OPTIONS: FontSizePreview[] = [
  { label: "Small", value: "small", scale: 0.88 },
  { label: "Standard", value: "standard", scale: 1 },
  { label: "Medium", value: "medium", scale: 1.12 },
  { label: "Large", value: "large", scale: 1.24 },
];

function ThemePresetPreviewCard({
  item,
  resolvedMode,
  active,
  onSelect,
}: {
  item: ThemePresetItem;
  resolvedMode: "light" | "dark";
  active: boolean;
  onSelect: (preset: ThemePresetItem["value"]) => void;
}) {
  const palette = resolvedMode === "dark" ? item.dark : item.light;
  const swatches = [
    palette.accent,
    palette.textStrong,
    palette.sidebar,
    palette.surface,
    palette.background,
  ];

  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      className="group min-w-0 rounded-xl text-left"
      aria-pressed={active}
    >
      <div
        className={cn(
          "relative h-24 w-full overflow-hidden rounded-xl border transition-all duration-200 hover:scale-102 hover:border-primary/60",
          active ? "border-primary/60" : "border-border/50",
        )}
        style={{ backgroundColor: palette.background }}
      >
        <div
          className="absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
          style={{
            backgroundColor: palette.surface,
            color: palette.textStrong,
          }}
        >
          {item.tone}
        </div>

        <div className="absolute right-2.5 top-2.5 flex items-start gap-1.5">
          {swatches.map((color, index) => (
            <span
              key={`${item.value}-${index}`}
              className="h-9 w-2.5 rounded-full border-[0.5px]"
              style={{ backgroundColor: color, borderColor: palette.surfaceBorder }}
            />
          ))}
        </div>

        <div
          className="absolute inset-x-0 bottom-0 h-14"
          style={{
            background: `linear-gradient(to top, ${palette.background} 42%, transparent)`,
          }}
        />
        <span
          className="absolute bottom-3 left-3 right-3 truncate text-lg font-semibold leading-none tracking-normal"
          style={{ color: palette.textStrong }}
        >
          {item.label.toLowerCase()}
        </span>
      </div>
    </button>
  );
}

function ThemePreviewCard({
  label,
  mode,
  lightPalette,
  darkPalette,
  active,
  onSelect,
}: {
  label: string;
  mode: ThemeMode;
  lightPalette: ThemePreviewPalette;
  darkPalette: ThemePreviewPalette;
  active: boolean;
  onSelect: (mode: ThemeMode) => void;
}) {
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  const previewPalette = mode === "dark" ? darkPalette : lightPalette;
  const foregroundPalette = mode === "dark" ? darkPalette : lightPalette;
  const lightClipPath = "polygon(0 0, 72% 0, 28% 100%, 0 100%)";
  const darkClipPath = "polygon(72% 0, 100% 0, 100% 100%, 28% 100%)";
  const content = (
    <span className="flex max-w-[calc(100%-1.5rem)] items-center gap-2">
      <Icon className="size-4 shrink-0" />
      <span className="truncate text-sm font-medium">{label}</span>
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className="group rounded-xl text-left"
      aria-pressed={active}
    >
      <div
        className={cn(
          "relative flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 hover:scale-102 hover:border-primary/60",
          active ? "border-primary/60" : "border-border/50",
        )}
        style={{ backgroundColor: previewPalette.background }}
      >
        {mode === "system" ? (
          <>
            <span
              className="absolute inset-0"
              style={{
                backgroundColor: lightPalette.background,
                clipPath: lightClipPath,
              }}
              aria-hidden="true"
            />
            <span
              className="absolute inset-0"
              style={{
                backgroundColor: darkPalette.background,
                clipPath: darkClipPath,
              }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ color: lightPalette.textStrong, clipPath: lightClipPath }}
              aria-hidden="true"
            >
              {content}
            </span>
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              style={{ color: darkPalette.textStrong, clipPath: darkClipPath }}
            >
              {content}
            </span>
          </>
        ) : (
          <span className="relative flex max-w-[calc(100%-1.5rem)] items-center gap-2" style={{ color: foregroundPalette.textStrong }}>
            <Icon className="size-4 shrink-0" />
            <span className="truncate text-sm font-medium">{label}</span>
          </span>
        )}
      </div>
    </button>
  );
}

function FontSizePreviewCard({
  item,
  active,
  onSelect,
}: {
  item: FontSizePreview;
  active: boolean;
  onSelect: (value: FontSizeOption) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      className="group rounded-xl text-left"
      aria-pressed={active}
    >
      <div
        className={cn(
          "flex h-24 w-full items-center justify-center rounded-xl border bg-background px-1 transition-all duration-200 hover:scale-102 hover:border-primary/60",
          active ? "border-primary/60" : "border-border/50",
        )}
      >
        <span
          className="truncate text-center font-medium leading-none text-foreground/90"
          style={{ fontSize: `calc(1rem * ${item.scale})` }}
        >
          {item.label} Aa
        </span>
      </div>
    </button>
  );
}

const TOAST_POSITION_PLACEMENT = {
  "top-left": ["top", "left"],
  "top-center": ["top", "center"],
  "top-right": ["top", "right"],
  "bottom-left": ["bottom", "left"],
  "bottom-center": ["bottom", "center"],
  "bottom-right": ["bottom", "right"],
} as const satisfies Record<ToastPosition, readonly ["top" | "bottom", "left" | "center" | "right"]>;

// A miniature viewport with the toast drawn in the chosen corner, so the
// option reads as a place rather than as a label.
function ToastPositionCard({ value, label, active, onSelect }: { value: ToastPosition; label: string; active: boolean; onSelect: (value: ToastPosition) => void }) {
  const [vertical, horizontal] = TOAST_POSITION_PLACEMENT[value];
  return (
    <button type="button" onClick={() => onSelect(value)} className="group rounded-xl text-left" aria-pressed={active} aria-label={label}>
      <div
        className={cn(
          "relative flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border bg-background px-1 transition-all duration-200 hover:scale-102 hover:border-primary/60",
          active ? "border-primary/60" : "border-border/50",
        )}
      >
        <span
          className={cn(
            "absolute h-2.5 w-9 rounded-sm transition-colors",
            active ? "bg-primary/70" : "bg-foreground/25 group-hover:bg-foreground/40",
            vertical === "top" ? "top-2.5" : "bottom-2.5",
            horizontal === "left" && "left-2.5",
            horizontal === "center" && "left-1/2 -translate-x-1/2",
            horizontal === "right" && "right-2.5",
          )}
        />
        <span className="truncate text-sm font-medium text-foreground/90">{label}</span>
      </div>
    </button>
  );
}

export function GeneralAppearanceSection({
  resolvedTheme,
  activeThemeMode,
  activeThemePreset,
  fontSize,
  toastPosition,
  onThemeModeChange,
  onThemePresetChange,
  onFontSizeChange,
  onToastPositionChange,
}: {
  resolvedTheme: "light" | "dark";
  activeThemeMode: ThemeMode;
  activeThemePreset: ThemePreset;
  fontSize: FontSizeOption;
  toastPosition: ToastPosition;
  onThemeModeChange: (mode: ThemeMode) => void;
  onThemePresetChange: (preset: ThemePreset) => void;
  onFontSizeChange: (value: FontSizeOption) => void;
  onToastPositionChange: (value: ToastPosition) => void;
}) {
  const t = useTranslations("settings");
  const activeThemePresetPreview = React.useMemo(
    () => THEME_PRESET_PREVIEWS.find((item) => item.value === activeThemePreset) ?? THEME_PRESET_PREVIEWS[0],
    [activeThemePreset],
  );

  return (
    <SettingsSection title={t("appearance")}>
      <FieldGroup className="gap-3 md:gap-4">
        <Field>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel className="mb-0">{t("generalPage.appearance.themePreset")}</FieldLabel>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={dispatchOpenThemeEditor}
              className="gap-1.5 text-xs"
            >
              <Palette className="size-3.5" />
              {t("generalPage.appearance.customizeTheme") || "Customize Theme"}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3 xl:gap-4">
            {THEME_PRESET_PREVIEWS.map((item) => (
              <ThemePresetPreviewCard
                key={item.value}
                item={{ ...item, label: t(`generalPage.appearance.preset.${item.value}`) }}
                resolvedMode={resolvedTheme}
                active={activeThemePreset === item.value}
                onSelect={onThemePresetChange}
              />
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel>{t("generalPage.appearance.colorMode")}</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3 xl:gap-4">
            <ThemePreviewCard
              label={t("generalPage.appearance.theme.light")}
              mode="light"
              lightPalette={activeThemePresetPreview.light}
              darkPalette={activeThemePresetPreview.dark}
              active={activeThemeMode === "light"}
              onSelect={onThemeModeChange}
            />
            <ThemePreviewCard
              label={t("generalPage.appearance.theme.system")}
              mode="system"
              lightPalette={activeThemePresetPreview.light}
              darkPalette={activeThemePresetPreview.dark}
              active={activeThemeMode === "system"}
              onSelect={onThemeModeChange}
            />
            <ThemePreviewCard
              label={t("generalPage.appearance.theme.dark")}
              mode="dark"
              lightPalette={activeThemePresetPreview.light}
              darkPalette={activeThemePresetPreview.dark}
              active={activeThemeMode === "dark"}
              onSelect={onThemeModeChange}
            />
          </div>
        </Field>

        <Field>
          <FieldLabel>{t("generalPage.appearance.fontSize")}</FieldLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:gap-3 xl:gap-4">
            {FONT_SIZE_OPTIONS.map((item) => (
              <FontSizePreviewCard
                key={item.value}
                item={{ ...item, label: t(`generalPage.appearance.fontSizeOption.${item.value}`) }}
                active={fontSize === item.value}
                onSelect={onFontSizeChange}
              />
            ))}
          </div>
        </Field>

        <Field>
          <FieldLabel>{t("generalPage.appearance.toastPosition")}</FieldLabel>
          <div className="grid grid-cols-3 gap-2 sm:max-w-[calc(75%-2px)] md:gap-3 md:max-w-[calc(75%-3px)] xl:gap-4 xl:max-w-[calc(75%-4px)]">
            {TOAST_POSITIONS.map((value) => (
              <ToastPositionCard
                key={value}
                value={value}
                label={t(`generalPage.appearance.toastPositionOption.${value}`)}
                active={toastPosition === value}
                onSelect={onToastPositionChange}
              />
            ))}
          </div>
        </Field>

      </FieldGroup>
    </SettingsSection>
  );
}
