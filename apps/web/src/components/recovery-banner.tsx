"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useActiveRun } from "@/hooks/use-active-run";
import { useProjectState } from "@/hooks/use-project-state";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { X } from "lucide-react";

export function RecoveryBanner() {
  const { activeRun, isLoading } = useActiveRun();
  const { data: state } = useProjectState();
  const [dismissed, setDismissed] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (isLoading) return null;
  if (!activeRun || activeRun.status !== "interrupted") return null;
  if (dismissed) return null;

  const handleRetry = async () => {
    const res = await postAction("retry", { confirmed: true });
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message);
    }
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
    queryClient.invalidateQueries({ queryKey: ["active-run"] });
  };

  const handleContinue = () => {
    setDismissed(true);
    toast("Continuing from current state.");
  };

  const handleInspect = () => {
    toast("Inspect: see the artifact panel and event log for details.");
  };

  const handleRevisePlan = async () => {
    const isAtPhaseLevel = !!state?.current_phase_state;
    const action = isAtPhaseLevel ? "replan_phase" : "replan_from_here";
    const res = await postAction(action);
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message);
    }
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
    queryClient.invalidateQueries({ queryKey: ["active-run"] });
    setDismissed(true);
  };

  return (
    <div
      role="alert"
      className="bg-warning-muted border-b border-warning px-4 py-2.5"
    >
      <div className="flex items-center justify-between gap-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-warning">⚠</span>
          <span className="text-sm text-text font-medium">
            Work may have stopped unexpectedly. What do you want to do?
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-surface-2 text-text border border-border hover:bg-surface-inset transition-colors"
            onClick={handleInspect}
            title="View the current state and event log"
          >
            Inspect
          </button>
          <button
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-surface-2 text-text border border-border hover:bg-surface-inset transition-colors"
            onClick={handleRetry}
            title="Retry the last action"
          >
            Retry
          </button>
          <button
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-surface-2 text-text border border-border hover:bg-surface-inset transition-colors"
            onClick={handleContinue}
            title="Dismiss and continue from current state"
          >
            Continue
          </button>
          <button
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-surface-2 text-text border border-border hover:bg-surface-inset transition-colors"
            onClick={handleRevisePlan}
            title="Create a new plan from the current state"
          >
            Revise Plan
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="ml-1 p-1 rounded hover:bg-surface-inset transition-colors"
            aria-label="Dismiss recovery banner"
          >
            <X className="h-3.5 w-3.5 text-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
}
