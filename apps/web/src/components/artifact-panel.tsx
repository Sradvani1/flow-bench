"use client";

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
import { ProjectCompleteScreen } from "@/components/project-complete-screen";
import type React from "react";

const RENDERER_MAP: Record<
  string,
  React.ComponentType<{ data: Record<string, unknown>; currentState?: string }>
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
  const { data: state } = useProjectState();
  const { data: artifact } = useCurrentArtifact(state);

  const effectiveState = state?.current_phase_state || state?.project_state || "";

  if (!state || state?.status === "no_project" || state?.status === "error") {
    return null;
  }

  if (state?.project_state === "project_complete") {
    return (
      <div className={`flex flex-col ${className}`}>
        <ScrollArea className="flex-1 p-6">
          <ProjectCompleteScreen />
        </ScrollArea>
      </div>
    );
  }

  const mapping = artifact?.mapping ?? null;
  const Renderer = mapping ? RENDERER_MAP[mapping.rendererName] : null;

  return (
    <div className={`flex flex-col ${className}`}>
      <ScrollArea className="flex-1 p-6" data-artifact-panel>
        {mapping &&
        mapping.rendererName === "EmptyStateCard" &&
        (mapping.filename === null || artifact?.data === null) ? (
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
          <Renderer data={artifact?.data ?? {}} currentState={effectiveState} />
        ) : mapping?.rendererName === "BlockedStateCard" ? (
          <BlockedStateCard />
        ) : (
          <EmptyStateCard
            title="Artifact"
            message="No artifact available."
          />
        )}
      </ScrollArea>
    </div>
  );
}
