"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectState } from "@/hooks/use-project-state";

const STATE_ARTIFACT_MAP: Record<string, string> = {
  scope_ready: "scope.json",
  master_plan_drafting: "master-plan.json",
  master_plan_sharpening: "master-plan.json",
  phase_queue_ready: "phase-queue.json",
  phase_plan: "phase-plan-{phase_id}.json",
  phase_sharpening: "phase-plan-{phase_id}.json",
  phase_ready_to_build: "build-summary-{phase_id}.json",
  phase_building: "build-summary-{phase_id}.json",
  phase_reviewing: "review-findings-{phase_id}.json",
  phase_testing: "test-results-{phase_id}.json",
  phase_fixing: "test-results-{phase_id}.json",
  phase_handoff: "handoff-{phase_id}.json",
  phase_complete: "handoff-{phase_id}.json",
};

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

interface ArtifactPanelProps {
  className?: string;
}

export function ArtifactPanel({ className = "" }: ArtifactPanelProps) {
  const { data: stateData, isLoading: stateLoading } = useProjectState();

  const isNoProject =
    stateData?.status === "no_project" || stateData?.status === "error";

  const deriveArtifactFilename = (): string | null => {
    if (!stateData) return null;

    const phaseState = stateData.current_phase_state;
    const projectState = stateData.project_state;

    // Phase-state precedence: when in a phase, show phase-level artifact
    const key = phaseState || projectState;
    if (!key) return null;

    const pattern = STATE_ARTIFACT_MAP[key];
    if (!pattern) return null;

    if (pattern.includes("{phase_id}")) {
      const phaseId = phaseState
        ? stateData.current_phase_id
        : null;
      if (!phaseId) return null;
      return pattern.replace("{phase_id}", phaseId);
    }

    return pattern;
  };

  const filename = deriveArtifactFilename();

  const { data: artifactData, isLoading: artifactLoading } = useQuery({
    queryKey: ["artifact", filename],
    queryFn: async () => {
      if (!filename) return null;
      const res = await fetch(
        `http://127.0.0.1:8000/api/v1/artifacts/${filename}`
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!filename,
    refetchInterval: 5000,
  });

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

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="px-4 py-2 border-b">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Artifact
        </h3>
      </div>
      <ScrollArea className="flex-1 p-4">
        {artifactLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : artifactData ? (
          <Card>
            <pre className="text-xs font-mono p-4 overflow-x-auto whitespace-pre-wrap break-all">
              {escapeHtml(JSON.stringify(artifactData, null, 2))}
            </pre>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">No artifact yet.</p>
        )}
      </ScrollArea>
    </div>
  );
}
