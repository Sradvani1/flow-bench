"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useActiveRun } from "@/hooks/use-active-run";
import { useProjectState } from "@/hooks/use-project-state";
import { postAction } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

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
    const panel = document.querySelector("[data-artifact-panel]");
    panel?.scrollIntoView({ behavior: "smooth" });
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
    <div className="bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            An action was interrupted
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-400">
            ({activeRun.action})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleInspect}
          >
            Inspect current state
          </Button>
          <Button
            variant="default"
            size="sm"
            className="text-xs h-7"
            onClick={handleRetry}
          >
            Retry
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleContinue}
          >
            Continue
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={handleRevisePlan}
          >
            Revise the plan
          </Button>
        </div>
      </div>
    </div>
  );
}
