export interface ArtifactMapping {
  artifactKey: string;
  filename: string | null;
  rendererName: string;
  emptyMessage: string;
  suggestedAction?: string;
}

const STAGE_ARTIFACT_MAP: Record<string, ArtifactMapping> = {
  starting: {
    artifactKey: "starting",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "No project started.",
    suggestedAction: "Type a description of your app idea to begin.",
  },
  scope_ready: {
    artifactKey: "scope",
    filename: "scope.json",
    rendererName: "ScopeCard",
    emptyMessage: "No scope defined yet.",
    suggestedAction: "Describe your app idea in the command pane.",
  },
  master_plan_drafting: {
    artifactKey: "master-plan",
    filename: "master-plan.json",
    rendererName: "MasterPlanCard",
    emptyMessage: "Generating master plan...",
  },
  master_plan_sharpening: {
    artifactKey: "sharpening-notes",
    filename: "sharpening-notes.json",
    rendererName: "SharpeningNotesCard",
    emptyMessage: "No sharpening notes yet.",
    suggestedAction: "Refine the plan to surface ambiguities.",
  },
  phase_queue_ready: {
    artifactKey: "phase-queue",
    filename: "phase-queue.json",
    rendererName: "PhaseQueueCard",
    emptyMessage: "No phases defined.",
  },
  phase_starting: {
    artifactKey: "phase-queue",
    filename: "phase-queue.json",
    rendererName: "PhaseQueueCard",
    emptyMessage: "Phase starting...",
  },
  phase_plan: {
    artifactKey: "phase-plan",
    filename: "phase-plan-{phase_id}.json",
    rendererName: "PhasePlanCard",
    emptyMessage: "No phase plan generated yet.",
  },
  phase_sharpening: {
    artifactKey: "sharpening-notes",
    filename: "sharpening-notes-{phase_id}.json",
    rendererName: "SharpeningNotesCard",
    emptyMessage: "No sharpening notes yet.",
    suggestedAction: "Refine the phase plan to surface ambiguities.",
  },
  phase_ready_to_build: {
    artifactKey: "phase-plan",
    filename: "phase-plan-{phase_id}.json",
    rendererName: "PhasePlanCard",
    emptyMessage: "No phase plan available.",
  },
  phase_building: {
    artifactKey: "build-summary",
    filename: "build-summary-{phase_id}.json",
    rendererName: "BuildSummaryCard",
    emptyMessage: "Build in progress...",
  },
  phase_reviewing: {
    artifactKey: "review-findings",
    filename: "review-findings-{phase_id}.json",
    rendererName: "ReviewFindingsCard",
    emptyMessage: "Review in progress...",
  },
  phase_testing: {
    artifactKey: "test-results",
    filename: "test-results-{phase_id}.json",
    rendererName: "TestResultsCard",
    emptyMessage: "Testing in progress...",
  },
  phase_handoff: {
    artifactKey: "handoff",
    filename: "handoff-{phase_id}.json",
    rendererName: "HandoffCard",
    emptyMessage: "No handoff generated yet.",
  },
  phase_complete: {
    artifactKey: "handoff",
    filename: "handoff-{phase_id}.json",
    rendererName: "HandoffCard",
    emptyMessage: "Phase complete.",
  },
  phase_fixing: {
    artifactKey: "findings",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "Fixing issues...",
  },
  phase_blocked: {
    artifactKey: "blocked",
    filename: null,
    rendererName: "BlockedStateCard",
    emptyMessage: "This phase is blocked.",
    suggestedAction: "Run retry or fix_failures to continue.",
  },
  project_blocked: {
    artifactKey: "blocked",
    filename: null,
    rendererName: "BlockedStateCard",
    emptyMessage: "Project is blocked.",
    suggestedAction: "Run retry to continue.",
  },
  project_complete: {
    artifactKey: "complete",
    filename: null,
    rendererName: "ProjectCompleteScreen",
    emptyMessage: "Project complete.",
  },
};

const DYNAMIC_STATE_FALLBACK: Record<string, string> = {
  master_plan_sharpened: "master_plan_sharpening",
  phase_sharpened: "phase_sharpening",
  phase_built: "phase_building",
  phase_reviewed: "phase_reviewing",
  phase_tested: "phase_testing",
};

export function getMapping(state: string): ArtifactMapping | null {
  const effective = DYNAMIC_STATE_FALLBACK[state] ?? state;
  return STAGE_ARTIFACT_MAP[effective] ?? null;
}

export function resolveFilename(
  state: string,
  phaseId?: string,
): string | null {
  const mapping = getMapping(state);
  if (!mapping || !mapping.filename) return null;
  if (mapping.filename.includes("{phase_id}")) {
    return phaseId ? mapping.filename.replace("{phase_id}", phaseId) : null;
  }
  return mapping.filename;
}
