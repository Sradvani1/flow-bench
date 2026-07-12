"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useProjectState } from "@/hooks/use-project-state";
import { useActiveRun } from "@/hooks/use-active-run";
import { useActions } from "@/hooks/use-actions";
import { useEvents } from "@/hooks/use-events";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

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

  const isProjectBlocked = state?.project_state === "project_blocked";
  const label = isProjectBlocked ? "Project Blocked" : "Phase Blocked";

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
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="destructive" className="text-xs">{label}</Badge>
        </div>
        <CardTitle className="text-lg mt-2">
          {state?.project_state_label ?? label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div>
          <h4 className="font-semibold text-foreground mb-1">What happened</h4>
          <p>{whatHappened}</p>
        </div>
        {recoveryActions.length > 0 && (
          <div>
            <h4 className="font-semibold text-foreground mb-1">Recovery actions</h4>
            <div className="flex flex-wrap gap-2">
              {recoveryActions.map((a) => (
                <Button
                  key={a.action}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleAction(a)}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
