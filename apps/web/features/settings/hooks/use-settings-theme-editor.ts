"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import {
  type CustomThemeConfig,
  CUSTOM_THEME_VERSION,
  isValidHexColor,
  serializeCustomTheme,
  validateStrictThemeImport,
} from "@/shared/model/custom-theme";
import { THEME_COLOR_TOKENS } from "@/shared/model/theme-presets";
import type { ThemePreset } from "@/shared/model/theme";
import { useTheme } from "@/shared/components/theme-provider";
import { patchMe } from "@/shared/api/auth";
import { useAuthSession } from "@/shared/auth/auth-session-context";
import { dispatchUserProfileUpdated } from "@/shared/auth/user-profile-events";
import { resolveLocalizedErrorMessage } from "@/i18n/resolve-error-message";
import {
  readLocalAppearancePreferences,
  serializeAppearancePreferences,
} from "@/features/settings/utils/appearance-preferences";

export type ThemeEditorMode = "light" | "dark";

export type UseSettingsThemeEditorResult = {
  activeMode: ThemeEditorMode;
  setActiveMode: (mode: ThemeEditorMode) => void;
  preset: ThemePreset;
  setPreset: (preset: ThemePreset) => void;
  lightOverrides: Record<string, string>;
  darkOverrides: Record<string, string>;
  updateTokenColor: (tokenKey: string, hexValue: string) => void;
  resetTokenColor: (tokenKey: string) => void;
  resetCurrentMode: () => void;
  resetAllToPreset: () => void;
  isSaving: boolean;
  isDirty: boolean;
  saveTheme: () => Promise<boolean>;
  cancelEditing: () => void;
  importThemeJSON: (content: string) => boolean;
  exportThemeJSON: () => string;
};

export function useSettingsThemeEditor(onClose?: () => void): UseSettingsThemeEditorResult {
  const t = useTranslations("settings");
  const { accessToken } = useAuthSession();
  const {
    preset: savedPreset,
    customTheme: savedCustomTheme,
    commitTheme,
    setPreviewDraft,
    cancelPreviewDraft,
    resolvedTheme,
  } = useTheme();

  const [activeMode, setActiveModeState] = React.useState<ThemeEditorMode>(resolvedTheme);
  const [presetDraft, setPresetDraft] = React.useState<ThemePreset>(savedPreset);
  const [lightDraft, setLightDraft] = React.useState<Record<string, string>>(() => ({
    ...(savedCustomTheme?.light ?? {}),
  }));
  const [darkDraft, setDarkDraft] = React.useState<Record<string, string>>(() => ({
    ...(savedCustomTheme?.dark ?? {}),
  }));
  const [isSaving, setIsSaving] = React.useState(false);

  const initialSavedSignatureRef = React.useRef(`${savedPreset}:${serializeCustomTheme(savedCustomTheme)}`);
  const hasNotifiedExternalUpdateRef = React.useRef(false);

  React.useEffect(() => {
    const currentSignature = `${savedPreset}:${serializeCustomTheme(savedCustomTheme)}`;
    if (!hasNotifiedExternalUpdateRef.current && currentSignature !== initialSavedSignatureRef.current) {
      hasNotifiedExternalUpdateRef.current = true;
      toast.info(t("generalPage.appearance.themeExternalUpdatedToast"));
    }
  }, [savedCustomTheme, savedPreset, t]);

  // Update live preview whenever draft changes
  React.useEffect(() => {
    const customThemeConfig: CustomThemeConfig | null =
      Object.keys(lightDraft).length > 0 || Object.keys(darkDraft).length > 0
        ? {
            version: CUSTOM_THEME_VERSION,
            light: lightDraft,
            dark: darkDraft,
          }
        : null;

    setPreviewDraft({
      preset: presetDraft,
      mode: activeMode,
      customTheme: customThemeConfig,
    });
  }, [activeMode, darkDraft, lightDraft, presetDraft, setPreviewDraft]);

  React.useEffect(() => {
    return () => {
      cancelPreviewDraft();
    };
  }, [cancelPreviewDraft]);

  const setActiveMode = React.useCallback((mode: ThemeEditorMode) => {
    setActiveModeState(mode);
  }, []);

  const setPreset = React.useCallback((nextPreset: ThemePreset) => {
    setPresetDraft(nextPreset);
  }, []);

  const updateTokenColor = React.useCallback(
    (tokenKey: string, hexValue: string) => {
      if (!Object.hasOwn(THEME_COLOR_TOKENS, tokenKey)) {
        return;
      }
      const normalized = hexValue.trim().toLowerCase();
      if (!isValidHexColor(normalized)) {
        return;
      }

      if (activeMode === "light") {
        setLightDraft((prev) => ({ ...prev, [tokenKey]: normalized }));
      } else {
        setDarkDraft((prev) => ({ ...prev, [tokenKey]: normalized }));
      }
    },
    [activeMode],
  );

  const resetTokenColor = React.useCallback(
    (tokenKey: string) => {
      if (activeMode === "light") {
        setLightDraft((prev) => {
          const next = { ...prev };
          delete next[tokenKey];
          return next;
        });
      } else {
        setDarkDraft((prev) => {
          const next = { ...prev };
          delete next[tokenKey];
          return next;
        });
      }
    },
    [activeMode],
  );

  const resetCurrentMode = React.useCallback(() => {
    if (activeMode === "light") {
      setLightDraft({});
    } else {
      setDarkDraft({});
    }
  }, [activeMode]);

  const resetAllToPreset = React.useCallback(() => {
    setLightDraft({});
    setDarkDraft({});
  }, []);

  const isDirty = React.useMemo(() => {
    if (presetDraft !== savedPreset) return true;
    const savedLight = savedCustomTheme?.light ?? {};
    const savedDark = savedCustomTheme?.dark ?? {};

    const lightKeys = Object.keys(lightDraft);
    if (lightKeys.length !== Object.keys(savedLight).length) return true;
    for (const k of lightKeys) {
      if (lightDraft[k] !== savedLight[k]) return true;
    }

    const darkKeys = Object.keys(darkDraft);
    if (darkKeys.length !== Object.keys(savedDark).length) return true;
    for (const k of darkKeys) {
      if (darkDraft[k] !== savedDark[k]) return true;
    }

    return false;
  }, [darkDraft, lightDraft, presetDraft, savedCustomTheme, savedPreset]);

  const saveTheme = React.useCallback(async (): Promise<boolean> => {
    const customThemeConfig: CustomThemeConfig | null =
      Object.keys(lightDraft).length > 0 || Object.keys(darkDraft).length > 0
        ? {
            version: CUSTOM_THEME_VERSION,
            light: lightDraft,
            dark: darkDraft,
          }
        : null;

    const currentLocal = readLocalAppearancePreferences();
    const appearancePreferences = serializeAppearancePreferences({
      ...currentLocal,
      preset: presetDraft,
      customTheme: customThemeConfig ?? undefined,
    });

    setIsSaving(true);
    try {
      if (accessToken) {
        const updatedUser = await patchMe(accessToken, { appearancePreferences });
        dispatchUserProfileUpdated(updatedUser);
      }
      commitTheme(presetDraft, customThemeConfig);
      toast.success(t("generalPage.appearance.themeSavedToast"));
      onClose?.();
      return true;
    } catch (error) {
      toast.error(t("generalPage.appearance.themeSaveFailedToast"), {
        description: resolveLocalizedErrorMessage(error),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [accessToken, commitTheme, darkDraft, lightDraft, onClose, presetDraft, t]);

  const cancelEditing = React.useCallback(() => {
    cancelPreviewDraft();
    onClose?.();
  }, [cancelPreviewDraft, onClose]);

  const importThemeJSON = React.useCallback(
    (content: string): boolean => {
      const validation = validateStrictThemeImport(content);
      if (!validation.ok) {
        toast.error(t("generalPage.appearance.themeImportInvalidToast"), {
          description: validation.error,
        });
        return false;
      }

      const payload = validation.payload;

      if (payload.preset) {
        setPresetDraft(payload.preset);
      }
      setLightDraft(payload.customTheme.light);
      setDarkDraft(payload.customTheme.dark);
      toast.success(t("generalPage.appearance.themeImportSuccessToast"));
      return true;
    },
    [t],
  );

  const exportThemeJSON = React.useCallback((): string => {
    const customThemeConfig: CustomThemeConfig = {
      version: CUSTOM_THEME_VERSION,
      light: lightDraft,
      dark: darkDraft,
    };
    return JSON.stringify(
      {
        version: CUSTOM_THEME_VERSION,
        preset: presetDraft,
        customTheme: customThemeConfig,
      },
      null,
      2,
    );
  }, [darkDraft, lightDraft, presetDraft]);

  return {
    activeMode,
    setActiveMode,
    preset: presetDraft,
    setPreset,
    lightOverrides: lightDraft,
    darkOverrides: darkDraft,
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
  };
}
