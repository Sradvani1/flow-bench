"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useActions } from "@/hooks/use-actions";
import { useProjectState } from "@/hooks/use-project-state";
import { useActiveRun } from "@/hooks/use-active-run";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ApprovalDialog } from "./approval-dialog";
import { Loader2, AlertTriangle } from "lucide-react";

export function CommandPane() {
  const { data: stateData, isLoading: stateLoading } = useProjectState();
  const { data: actions, isLoading: actionsLoading } = useActions();
  const { activeRun } = useActiveRun();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [riskAction, setRiskAction] = useState<ActionEntry | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);

  const reloadAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
    queryClient.invalidateQueries({ queryKey: ["active-run"] });
  };

  const handleAction = async (entry: ActionEntry) => {
    if (!entry.enabled) return;

    if (entry.action_type === "navigation") {
      return;
    }

    if (entry.risk_category) {
      setRiskAction(entry);
      setRiskOpen(true);
      return;
    }

    setPending(true);
    try {
      const res = await postAction(entry.action);
      if (res.status === "error") {
        toast(res.message, "destructive");
      } else if (res.message) {
        toast(res.message);
      }
      reloadAll();
    } finally {
      setPending(false);
    }
  };

  if (stateLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const allActions = (actions ?? []).filter((a) => a.action !== "load_existing_project" && a.action !== "start_new_project");

  const systemActions = allActions.filter((a) => a.action_type === "system" && !a.risk_category);
  const adapterActions = allActions.filter((a) => a.action_type === "adapter" && !a.risk_category);
  const riskyActions = allActions.filter((a) => a.risk_category);
  const navigationActions = allActions.filter((a) => a.action_type === "navigation");

  const primaryAction = allActions.find((a) => a.enabled && !a.risk_category && a.action_type !== "navigation")
    ?? systemActions[0]
    ?? null;

  const otherActions = allActions.filter((a) => a !== primaryAction && a.action_type !== "navigation");
  const otherSorted = [...systemActions.filter((a) => a !== primaryAction), ...adapterActions, ...riskyActions];

  const isRunning = activeRun?.status === "running" || activeRun?.status === "queued";

  return (
    <nav aria-label="Actions" className="flex flex-col h-full">
      {/* Section A: Primary action — always visible without scrolling */}
      <div className="shrink-0 px-3 pt-3 pb-2">
        {primaryAction && (
          <div>
            <Button
              className="w-full bg-primary text-text-inverse hover:bg-primary-hover text-sm font-medium h-auto py-2.5"
              onClick={() => handleAction(primaryAction)}
              disabled={pending || !primaryAction.enabled}
            >
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {primaryAction.label}
            </Button>
            {primaryAction.description && (
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                {primaryAction.description}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Section B: Other valid actions (scrollable) */}
      <ScrollArea className="flex-1 px-3">
        {otherSorted.length > 0 && (
          <div className="space-y-1 pb-3">
            {otherSorted.map((a) => (
              <button
                key={a.action}
                onClick={() => handleAction(a)}
                disabled={!a.enabled || pending}
                className={`
                  w-full text-left rounded-md border px-3 py-2 text-sm transition-colors
                  ${a.enabled
                    ? "border-border hover:border-primary/40 hover:bg-surface-2 text-text"
                    : "border-border opacity-40 cursor-not-allowed"
                  }
                `}
                title={!a.enabled ? a.description : undefined}
              >
                <div className="flex items-center gap-2">
                  {a.risk_category && (
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                  )}
                  <span className="font-medium">{a.label}</span>
                </div>
                {a.description && (
                  <p className="text-xs text-text-muted mt-0.5">{a.description}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {!primaryAction && otherSorted.length === 0 && !actionsLoading && (
          <p className="text-xs text-text-muted text-center py-8">No actions available.</p>
        )}

        {actionsLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </ScrollArea>

      {/* Section C: Status block */}
      <div className="shrink-0 border-t border-divider px-3 py-2.5">
        {isRunning && activeRun ? (
          <div className="flex items-center gap-2 text-xs text-info">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="truncate">
              Building {activeRun.phase_id ? `Phase ${activeRun.phase_id}` : "..."}
            </span>
          </div>
        ) : activeRun?.status === "interrupted" ? (
          <p className="text-xs text-warning">Last action was interrupted</p>
        ) : (
          <p className="text-xs text-text-faint">No active run</p>
        )}
      </div>

      <ApprovalDialog
        action={riskAction}
        open={riskOpen}
        onOpenChange={setRiskOpen}
        onComplete={reloadAll}
      />
    </nav>
  );
}
