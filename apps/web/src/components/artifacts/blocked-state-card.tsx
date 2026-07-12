"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useProjectState } from "@/hooks/use-project-state";
import { useActiveRun } from "@/hooks/use-active-run";
import { useActions } from "@/hooks/use-actions";
import { useEvents } from "@/hooks/use-events";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle } from "lucide-react";

export function BlockedStateCard() {
  const { data: state } = useProjectState();
  const { activeRun } = useActiveRun();
  const { data: actions } = useActions();
  const { events } = useEvents();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isBlocked =
    state?.project_state === "project_blocked" ||
    state?.current_phase_state === "phase_blocked";

  if (!isBlocked) return null;

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const whatHappened = activeRun?.failure_message
    ?? lastEvent?.description
    ?? "No additional details available.";

  const handleAction = async (entry: ActionEntry) => {
    const res = await postAction(entry.action, entry.risk_category ? { confirmed: true } : undefined);
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message);
    }
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const recoveryActions = (actions ?? []).filter(
    (a) =>
      a.action_type === "adapter" ||
      a.action === "replan_from_here" ||
      a.action === "cancel_project" ||
      a.action === "replan_phase"
  );

  return (
    <div className="bg-surface-2 shadow-sm rounded-xl p-6 max-w-[720px] mx-auto">
      <span className="inline-flex items-center rounded-full bg-error text-white px-3 py-0.5 text-xs font-medium mb-4">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Blocked
      </span>
      <h2 className="font-display text-xl text-text mb-4">
        {state?.project_state_label ?? "Blocked"}
      </h2>
      <div className="h-px bg-divider mb-4" />

      <div className="space-y-6 max-w-[65ch]">
        <section>
          <h3 className="font-body font-bold text-base text-text mb-2">What happened</h3>
          <p className="text-sm text-text-muted leading-relaxed">{whatHappened}</p>
        </section>

        {recoveryActions.length > 0 && (
          <section>
            <h3 className="font-body font-bold text-base text-text mb-3">What you can do</h3>
            <div className="space-y-2">
              {recoveryActions.map((a) => (
                <button
                  key={a.action}
                  onClick={() => handleAction(a)}
                  className="w-full text-left rounded-lg border border-border hover:border-primary/40 hover:bg-surface-inset transition-colors px-4 py-3"
                >
                  <span className="block text-sm font-medium text-text">{a.label}</span>
                  {a.description && (
                    <span className="block text-xs text-text-muted mt-0.5">{a.description}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
