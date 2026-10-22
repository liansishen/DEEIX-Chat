"use client";

import * as React from "react";
import { ThemeEditorSheet } from "./theme-editor-sheet";
import { subscribeOpenThemeEditor } from "@/features/settings/events/theme-editor-events";
import { useAuthSession } from "@/shared/auth/auth-session-context";

export function ThemeEditorHost() {
  const { user } = useAuthSession();
  const [open, setOpen] = React.useState(false);
  const currentUserID = user?.publicID ?? "";
  const previousUserIDRef = React.useRef(currentUserID);

  React.useEffect(() => {
    if (previousUserIDRef.current && previousUserIDRef.current !== currentUserID) {
      setOpen(false);
    }
    previousUserIDRef.current = currentUserID;
  }, [currentUserID]);

  React.useEffect(() => {
    return subscribeOpenThemeEditor(() => {
      setOpen(true);
    });
  }, []);

  if (!open) {
    return null;
  }

  return <ThemeEditorSheet key={currentUserID} open={open} onOpenChange={setOpen} />;
}
