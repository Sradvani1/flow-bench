"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePhaseQueue, type PhaseQueueItem } from "@/hooks/use-phase-queue";
import { useProjectState } from "@/hooks/use-project-state";

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-gray-500",
  in_progress: "bg-blue-500",
  complete: "bg-green-500",
  blocked: "bg-red-500",
  skipped: "bg-yellow-500",
};

const STATUS_VARIANTS: Record<string, "secondary" | "default" | "destructive" | "outline"> = {
  upcoming: "secondary",
  in_progress: "default",
  complete: "default",
  blocked: "destructive",
  skipped: "outline",
};

interface PhaseQueueProps {
  className?: string;
}

export function PhaseQueue({ className = "" }: PhaseQueueProps) {
  const { data: stateData, isLoading: stateLoading } = useProjectState();
  const { data: phases, isLoading: phasesLoading } = usePhaseQueue();

  const isNoProject =
    stateData?.status === "no_project" || stateData?.status === "error";

  if (stateLoading || phasesLoading) {
    return (
      <div className={`flex flex-col p-4 gap-2 ${className}`}>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (isNoProject) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <p className="text-xs text-muted-foreground text-center">
          Start a project to see phases.
        </p>
      </div>
    );
  }

  if (!phases || phases.length === 0) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <p className="text-xs text-muted-foreground text-center">
          No phases yet.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`} data-phase-queue>
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Phases
        </h3>
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="flex flex-col gap-1">
          {phases.map((phase: PhaseQueueItem) => (
            <div
              key={phase.phase_id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/50 text-sm"
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  STATUS_COLORS[phase.status] ?? "bg-gray-400"
                }`}
              />
              <span className="flex-1 truncate">{phase.name}</span>
              <Badge
                variant={STATUS_VARIANTS[phase.status] ?? "secondary"}
                className="text-[10px] px-1.5 py-0"
              >
                {phase.status.replace(/_/g, " ")}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
