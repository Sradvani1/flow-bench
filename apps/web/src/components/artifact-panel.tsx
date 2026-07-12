"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectState } from "@/hooks/use-project-state";
import { useCurrentArtifact } from "@/hooks/use-current-artifact";
import {
  ScopeCard,
  MasterPlanCard,
  SharpeningNotesCard,
  PhasePlanCard,
  BuildSummaryCard,
  ReviewFindingsCard,
  TestResultsCard,
  HandoffCard,
  DecisionCard,
  AuditCard,
  PhaseQueueCard,
  EmptyStateCard,
  BlockedStateCard,
} from "@/components/artifacts";
import type React from "react";

const RENDERER_MAP: Record<
  string,
  React.ComponentType<{ data: Record<string, unknown> }>
> = {
  ScopeCard,
  MasterPlanCard,
  SharpeningNotesCard,
  PhasePlanCard,
  BuildSummaryCard,
  ReviewFindingsCard,
  TestResultsCard,
  HandoffCard,
  DecisionCard,
  AuditCard,
  PhaseQueueCard,
  BlockedStateCard,
};

interface ArtifactPanelProps {
  className?: string;
}

export function ArtifactPanel({ className = "" }: ArtifactPanelProps) {
  const { data: state, isLoading: stateLoading } = useProjectState();
  const { data: artifact, isLoading: artifactLoading } =
    useCurrentArtifact(state);

  const isNoProject =
    state?.status === "no_project" || state?.status === "error";

  if (stateLoading) {
    return (
      <div className={`flex flex-col p-4 gap-2 ${className}`}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="flex-1 rounded-lg" />
      </div>
    );
  }

  if (isNoProject) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <p className="text-sm text-muted-foreground">
          Start a project to begin.
        </p>
      </div>
    );
  }

  const mapping = artifact?.mapping ?? null;
  const Renderer = mapping ? RENDERER_MAP[mapping.rendererName] : null;

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Artifact
        </h3>
      </div>
      <ScrollArea className="flex-1 p-4" data-artifact-panel>
        {artifactLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : mapping && mapping.rendererName === "EmptyStateCard" && (mapping.filename === null || artifact?.data === null) ? (
          <EmptyStateCard
            title={
              state?.current_phase_state_label ??
              state?.project_state_label ??
              mapping.artifactKey
            }
            message={mapping.emptyMessage}
            suggestedAction={mapping.suggestedAction}
          />
        ) : Renderer && Renderer !== BlockedStateCard ? (
          <Renderer data={artifact?.data ?? {}} />
        ) : mapping?.rendererName === "BlockedStateCard" ? (
          <BlockedStateCard />
        ) : mapping?.rendererName === "BlockedStateCard" ? null : (
          <EmptyStateCard
            title="Artifact"
            message="No artifact available."
          />
        )}
      </ScrollArea>
    </div>
  );
}
