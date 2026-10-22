"use client";

import * as React from "react";

import { resolveAppearancePreferences } from "@/features/settings/utils/appearance-preferences";
import {
  readChatFontPreference,
  readChatFontWeightPreference,
  writeChatFontPreference,
  writeChatFontWeightPreference,
} from "@/features/settings/utils/chat-font";
import {
  readFontSizePreference,
  writeFontSizePreference,
} from "@/features/settings/utils/font-size";
import { useAuthSession } from "@/shared/auth/auth-session-context";
import { useTheme } from "@/shared/components/theme-provider";

export function AppearancePreferencesSync(): null {
  const { user, userStatus } = useAuthSession();
  const { commitTheme, cancelPreviewDraft } = useTheme();
  const currentUserIDRef = React.useRef<string>("");
  const syncedAppearanceRef = React.useRef<string>("");

  React.useEffect(() => {
    if (userStatus === "loading") {
      return;
    }
    if (!user) {
      syncedAppearanceRef.current = "";
      currentUserIDRef.current = "";
      return;
    }

    const raw = user?.appearancePreferences?.trim() ?? "";
    const syncKey = `${user.publicID}:${raw}`;
    if (syncKey === syncedAppearanceRef.current) {
      return;
    }

    if (currentUserIDRef.current && currentUserIDRef.current !== user.publicID) {
      // User switched account: exit active theme preview draft.
      cancelPreviewDraft();
    }
    currentUserIDRef.current = user.publicID;
    syncedAppearanceRef.current = syncKey;

    const next = resolveAppearancePreferences(raw);
    commitTheme(next.preset, next.customTheme ?? null, true);
    if (next.chatFont !== readChatFontPreference()) {
      writeChatFontPreference(next.chatFont);
    }
    if (next.chatFontWeight !== readChatFontWeightPreference()) {
      writeChatFontWeightPreference(next.chatFontWeight);
    }
    if (next.fontSize !== readFontSizePreference()) {
      writeFontSizePreference(next.fontSize);
    }
  }, [cancelPreviewDraft, commitTheme, user, userStatus]);

  return null;
}
