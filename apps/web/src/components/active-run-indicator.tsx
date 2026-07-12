"use client";

import { useActiveRun } from "@/hooks/use-active-run";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { Loader2 } from "lucide-react";

export function ActiveRunIndicator() {
  const { activeRun, isLoading } = useActiveRun();

  if (isLoading) return null;
  if (!activeRun) return null;

  const isRunning = activeRun.status === "running" || activeRun.status === "queued";
  if (!isRunning) return null;

  const elapsed = useElapsedTime(activeRun.started_at ?? null);
  const isAutoDispatch = ["auto_review", "auto_test", "review", "test"].some((a) => activeRun.action?.includes(a)) ?? false;

  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg bg-info/10 border border-info/30 px-3 py-2 text-xs shadow-sm cursor-pointer hover:bg-info/20 transition-colors"
      aria-live="polite"
      aria-label={`Run status: ${isAutoDispatch ? "auto-dispatch" : "active"} - ${elapsed}`}
      onClick={() => {
        const scrollArea = document.querySelector("[data-artifact-panel]");
        scrollArea?.scrollTo({ top: scrollArea.scrollHeight, behavior: "smooth" });
      }}
    >
      <Loader2 className={`h-3.5 w-3.5 animate-spin shrink-0 ${isAutoDispatch ? "text-warning" : "text-info"}`} />
      <span className={isAutoDispatch ? "text-warning" : "text-info"}>
        {isAutoDispatch ? "Reviewing automatically…" : "Building…"}
      </span>
      <span className="text-text-faint font-mono">{elapsed}</span>
    </div>
  );
}
