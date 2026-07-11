"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

import { useActions } from "@/hooks/use-actions";
import { useProjectState } from "@/hooks/use-project-state";
import { postAction, type ActionEntry } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { RiskConfirmationDialog } from "./risk-confirmation-dialog";

interface CommandPaneProps {
  className?: string;
}

export function CommandPane({ className = "" }: CommandPaneProps) {
  const { data: stateData, isLoading: stateLoading } = useProjectState();
  const { data: actions, isLoading: actionsLoading } = useActions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [scopeText, setScopeText] = useState("");
  const [creating, setCreating] = useState(false);
  const [riskAction, setRiskAction] = useState<ActionEntry | null>(null);
  const [riskOpen, setRiskOpen] = useState(false);

  const isNoProject =
    stateData?.status === "no_project" || stateData?.status === "error";

  const reloadAll = () => {
    queryClient.invalidateQueries({ queryKey: ["project-state"] });
    queryClient.invalidateQueries({ queryKey: ["actions"] });
  };

  const handleAction = async (entry: ActionEntry) => {
    if (entry.action_type === "navigation") {
      if (entry.action === "view_all_phases") {
        const queue = document.querySelector("[data-phase-queue]");
        queue?.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }

    if (entry.action_type === "adapter") {
      const res = await postAction(entry.action);
      toast(res.message);
      reloadAll();
      return;
    }

    if (entry.risk_category) {
      setRiskAction(entry);
      setRiskOpen(true);
      return;
    }

    const res = await postAction(entry.action);
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else if (res.message) {
      toast(res.message);
    }
    reloadAll();
  };

  const handleCreateProject = async () => {
    if (!scopeText.trim()) return;
    setCreating(true);
    const res = await postAction("start_new_project", {
      scope_content: scopeText,
    });
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message ?? "Project created");
    }
    setCreating(false);
    reloadAll();
  };

  if (stateLoading) {
    return (
      <div className={`flex flex-col gap-2 p-4 ${className}`}>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (isNoProject) {
    return (
      <div className={`flex flex-col p-4 gap-4 ${className}`}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Actions
        </h3>
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-sm mb-2">Start new project</h4>
          <textarea
            className="w-full h-24 rounded border border-input bg-background p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Describe your app idea..."
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
          />
          <Button
            className="w-full mt-2"
            onClick={handleCreateProject}
            disabled={creating || !scopeText.trim()}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    );
  }

  const systemActions = (actions ?? []).filter(
    (a) => a.action_type === "system" && !a.risk_category
  );
  const riskyActions = (actions ?? []).filter(
    (a) => a.action_type === "system" && a.risk_category
  );
  const navigationActions = (actions ?? []).filter(
    (a) => a.action_type === "navigation"
  );
  const adapterActions = (actions ?? []).filter(
    (a) => a.action_type === "adapter"
  );

  return (
    <div className={`flex flex-col ${className}`}>
      <ScrollArea className="flex-1 p-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Actions
        </h3>

        {actionsLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {systemActions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Project actions</p>
                <div className="flex flex-col gap-1.5">
                  {systemActions.map((a) => (
                    <Button
                      key={a.action}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {riskyActions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Risky actions</p>
                <div className="flex flex-col gap-1.5">
                  {riskyActions.map((a) => (
                    <Button
                      key={a.action}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2 border-destructive/30 text-destructive hover:text-destructive"
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {navigationActions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Navigation</p>
                <div className="flex flex-col gap-1.5">
                  {navigationActions.map((a) => (
                    <Button
                      key={a.action}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {adapterActions.length > 0 && (
              <div className="mb-4">
                <p className="text-xs text-muted-foreground mb-2">Execution</p>
                <div className="flex flex-col gap-1.5">
                  {adapterActions.map((a) => (
                    <Button
                      key={a.action}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2 opacity-50 hover:opacity-70"
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {actions?.length === 0 && (
              <p className="text-xs text-muted-foreground">No actions available.</p>
            )}
          </>
        )}
      </ScrollArea>

      <RiskConfirmationDialog
        action={riskAction}
        open={riskOpen}
        onOpenChange={setRiskOpen}
        onComplete={reloadAll}
      />
    </div>
  );
}
