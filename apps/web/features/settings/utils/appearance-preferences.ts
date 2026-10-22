"use client";

import {
  CHAT_FONT_STORAGE_KEY,
  CHAT_FONT_WEIGHT_STORAGE_KEY,
  isChatFontOption,
  isChatFontWeightOption,
  type ChatFontOption,
  type ChatFontWeightOption,
} from "@/features/settings/utils/chat-font";
import {
  FONT_SIZE_STORAGE_KEY,
  isFontSizeOption,
  type FontSizeOption,
} from "@/features/settings/utils/font-size";
import {
  THEME_PRESET_STORAGE_KEY,
  THEME_PRESETS,
  type ThemePreset,
} from "@/shared/model/theme";
import {
  type CustomThemeConfig,
  CUSTOM_THEME_STORAGE_KEY,
  parseCustomTheme,
  validateAndSanitizeCustomTheme,
} from "@/shared/model/custom-theme";
import { isOneOf, isRecord, parseJSON } from "@/shared/lib/type-guards";

export type AppearancePreferences = {
  preset: ThemePreset;
  chatFont: ChatFontOption;
  chatFontWeight: ChatFontWeightOption;
  fontSize: FontSizeOption;
  customTheme?: CustomThemeConfig;
};

export type AppearancePreferencePatch = Partial<AppearancePreferences>;

const isThemePreset = isOneOf(THEME_PRESETS);

export function parseAppearancePreferences(raw: string | null | undefined): AppearancePreferencePatch {
  if (!raw) {
    return {};
  }

  const parsed = parseJSON(raw);
  if (!isRecord(parsed)) {
    return {};
  }

  const result: AppearancePreferencePatch = {};
  if (isThemePreset(parsed.preset)) {
    result.preset = parsed.preset;
  }
  if (isChatFontOption(parsed.chatFont)) {
    result.chatFont = parsed.chatFont;
  }
  if (isChatFontWeightOption(parsed.chatFontWeight)) {
    result.chatFontWeight = parsed.chatFontWeight;
  }
  if (isFontSizeOption(parsed.fontSize)) {
    result.fontSize = parsed.fontSize;
  }
  if (parsed.customTheme !== undefined) {
    const validated = validateAndSanitizeCustomTheme(parsed.customTheme);
    if (validated) {
      result.customTheme = validated;
    }
  }
  return result;
}

export function readLocalAppearancePreferences(): AppearancePreferences {
  if (typeof window === "undefined") {
    return {
      preset: "default",
      chatFont: "default",
      chatFontWeight: "regular",
      fontSize: "standard",
    };
  }

  const storedPreset = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY);
  const storedChatFont = window.localStorage.getItem(CHAT_FONT_STORAGE_KEY);
  const storedChatFontWeight = window.localStorage.getItem(CHAT_FONT_WEIGHT_STORAGE_KEY);
  const storedFontSize = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  return {
    preset: isThemePreset(storedPreset) ? storedPreset : "default",
    chatFont: isChatFontOption(storedChatFont) ? storedChatFont : "default",
    chatFontWeight: isChatFontWeightOption(storedChatFontWeight) ? storedChatFontWeight : "regular",
    fontSize: isFontSizeOption(storedFontSize) ? storedFontSize : "standard",
    customTheme: parseCustomTheme(window.localStorage.getItem(CUSTOM_THEME_STORAGE_KEY)),
  };
}

export function resolveAppearancePreferences(
  accountPreferences: string | null | undefined,
): AppearancePreferences {
  if (!accountPreferences || accountPreferences.trim() === "") {
    return {
      preset: "default",
      chatFont: "default",
      chatFontWeight: "regular",
      fontSize: "standard",
      customTheme: undefined,
    };
  }

  const parsed = parseAppearancePreferences(accountPreferences);
  const local = readLocalAppearancePreferences();
  return {
    preset: parsed.preset ?? "default",
    chatFont: parsed.chatFont ?? local.chatFont,
    chatFontWeight: parsed.chatFontWeight ?? local.chatFontWeight,
    fontSize: parsed.fontSize ?? local.fontSize,
    customTheme: parsed.customTheme,
  };
}

export function serializeAppearancePreferences(preferences: AppearancePreferences): string {
  const payload: Record<string, unknown> = {
    preset: preferences.preset,
    chatFont: preferences.chatFont,
    chatFontWeight: preferences.chatFontWeight,
    fontSize: preferences.fontSize,
  };
  if (preferences.customTheme && (Object.keys(preferences.customTheme.light).length > 0 || Object.keys(preferences.customTheme.dark).length > 0)) {
    payload.customTheme = preferences.customTheme;
  }
  return JSON.stringify(payload);
}
