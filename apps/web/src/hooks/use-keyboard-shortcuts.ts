"use client";

import { useEffect } from "react";

interface KeyboardShortcuts {
  onOpenSettings: () => void;
  onFocusPrimaryAction: () => void;
  onDismissDialog: () => void;
  onConfirmAction: () => void;
}

export function useKeyboardShortcuts({
  onOpenSettings,
  onFocusPrimaryAction,
  onDismissDialog,
  onConfirmAction,
}: KeyboardShortcuts) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "Escape") {
        e.preventDefault();
        onDismissDialog();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onFocusPrimaryAction();
        return;
      }

      if (e.key === "?" && !isInput) {
        e.preventDefault();
        // Show keyboard shortcuts reference — for now a simple notification
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSettings, onFocusPrimaryAction, onDismissDialog, onConfirmAction]);
}
