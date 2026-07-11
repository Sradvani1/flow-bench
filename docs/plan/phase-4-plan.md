# Phase 4 — Artifacts and Timeline: Formatted Cards, Paginated Event Log

**Status**: Plan — ready for implementation.
**Based on commit**: `147be69` (Phase 3 complete)

## Goal

Replace raw JSON artifact rendering with 10 formatted plain-English cards, add a paginated timeline at the bottom of the page, and align all stage-to-artifact mappings with the workflow contract.

## Non-Goals (Explicitly Out of Scope)

- **No backend state machine or dispatch changes** — Phase 3 already shipped the adapter pipeline.
- **No changes to command pane, phase queue sidebar, or project header.**
- **No new dependencies** — `Intl.RelativeTimeFormat` for timestamps, no date-fns/moment.
- **No timeline collapsibility toggle** — deferred.
- **No `view_handoff_notes` / `view_summary` wiring** — deferred to Phase 7.
- **No keyboard/ARIA for timeline** — deferred to Phase 5.
- **No changes to schema models** — all cards read `Record<string, unknown>` and render known keys defensively.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ PROJECT HEADER                                               │
├───────────┬──────────────────────────┬───────────────────────┤
│ Phase     │ ARTIFACT PANEL           │ COMMAND PANE          │
│ Queue     │ (formatted card per      │ (unchanged)           │
│ (220px,   │  artifact type;          │                       │
│ unchanged) │  empty-state with        │                       │
│           │  suggested action)        │                       │
├───────────┴──────────────────────────┴───────────────────────┤
│ TIMELINE (250px, border-t, paginated, level-filtered)        │
└──────────────────────────────────────────────────────────────┘
```

## Artifact Card Specifications

Every artifact card follows the same visual hierarchy: **Card > CardHeader (title + optional meta) > CardContent (sectioned, text-sm)**. Language style is consistent — plain English, present tense, no jargon unless the field name requires it (e.g., `estimated_complexity`). All timestamps render as relative ("2m ago") with absolute on hover/title. Null/missing fields are skipped, never shown as "undefined".

### ScopeCard

| Property | Detail |
|----------|--------|
| **Filenames** | `scope.json` |
| **Contract artifact** | `scope` |
| **States** | `scope_ready` |
| **Required sections** | Title "Scope" — Content block (`whitespace-pre-wrap font-mono text-xs`) — "Updated X ago" footer |
| **Language style** | Verbatim display. Content is user-authored plain text; render exactly as stored. No reformatting. |
| **Null state** | "No scope defined yet." → suggested action: "Describe your app idea in the command pane." |

### MasterPlanCard

| Property | Detail |
|----------|--------|
| **Filenames** | `master-plan.json` |
| **Contract artifact** | `master-plan` |
| **States** | `master_plan_drafting` |
| **Required sections** | Title: project name — "N phases" badge — Section "Phases" (numbered list, each with name + description) — Section "Architecture Decisions" (bullet list) — "Generated X ago" footer |
| **Language style** | Descriptive, future-tense for planned work. Architecture decisions phrased as affirmations ("Use React with Server Components"). |
| **Null state** | "Generating master plan..." (no suggested action — in-progress state) |

### SharpeningNotesCard

| Property | Detail |
|----------|--------|
| **Filenames** | `sharpening-notes.json` |
| **Contract artifact** | `sharpening-notes` |
| **States** | `master_plan_sharpening`, `phase_sharpening` |
| **Required sections** | Title "Sharpening Notes" — Each round as a sub-card: heading "Round N of M" — "Prompt" in italic — "Feedback" in blockquote — Accent border on unresolved rounds — Collapsed by default, first round expanded |
| **Language style** | Verbatim for prompts (user/adapter authored). Feedback phrased as observations ("The plan does not specify test framework"). |
| **Null state** | "No sharpening notes yet." → suggested action: "Refine the plan to surface ambiguities." |

### PhasePlanCard

| Property | Detail |
|----------|--------|
| **Filenames** | `phase-plan-{phase_id}.json` |
| **Contract artifact** | `phase-plan` |
| **States** | `phase_plan`, `phase_ready_to_build` |
| **Required sections** | Title: phase name + complexity badge (e.g., "Medium") — Summary paragraph — Section "Dependencies" (tag list, one per dependency) — Section "Success Criteria" (checklist with check icons) — Section "Sub-tasks" (numbered list, id + description) — "Generated X ago" footer |
| **Language style** | Imperative for sub-tasks ("Create the database schema"), descriptive for success criteria ("All endpoints return 200"). |
| **Null state** | "No phase plan generated yet." |

### BuildSummaryCard

| Property | Detail |
|----------|--------|
| **Filenames** | `build-summary-{phase_id}.json` |
| **Contract artifact** | `build-summary` |
| **States** | `phase_building` |
| **Required sections** | Title "Build Summary" + status badge (success=green `bg-green-100 text-green-800`, failure=red) — Summary paragraph — Section "Files Created" (count + expandable list) — Section "Files Modified" (count + expandable list) — Section "Files Deleted" (count + expandable list) — "Completed X ago" footer |
| **Language style** | Factual, past tense ("Created 3 files, modified 2"). File lists in `font-mono text-xs`. |
| **Null state** | "No build summary available." (artifact exists but is empty) |
| **In-progress while building** | `phase_building` with null fetch → "Build in progress..." |

### ReviewFindingsCard

| Property | Detail |
|----------|--------|
| **Filenames** | `review-findings-{phase_id}.json` |
| **Contract artifact** | `review-findings` |
| **States** | `phase_reviewing` |
| **Required sections** | Title "Review Findings" — Summary as lead paragraph — Findings table: severity badge (critical=red, warning=amber, info=blue) + description + file path in code font — "Completed X ago" footer |
| **Language style** | Findings phrased as issues ("File X is missing error handling"). Severity is a property, not an editorial voice. |
| **Null state** | "No review findings available." (artifact exists but is empty) |
| **In-progress while reviewing** | `phase_reviewing` with null fetch → "Review in progress..." |

### TestResultsCard

| Property | Detail |
|----------|--------|
| **Filenames** | `test-results-{phase_id}.json` |
| **Contract artifact** | `test-results` |
| **States** | `phase_testing` |
| **Required sections** | Title "Test Results" — Pass/fail/skipped count badges (pass=green, fail=red, skip=gray) — Summary line — Details list: each test as a row (status icon + name + optional failure message in red) — "Completed X ago" footer |
| **Language style** | Purely factual. Numbers first ("3 passed, 1 failed, 0 skipped"). Failure messages verbatim. |
| **Null state** | "No test results available." (artifact exists but is empty) |
| **In-progress while testing** | `phase_testing` with null fetch → "Testing in progress..." |

### HandoffCard

| Property | Detail |
|----------|--------|
| **Filenames** | `handoff-{phase_id}.json` |
| **Contract artifact** | `handoff` |
| **States** | `phase_handoff` (project + phase), `phase_complete` |
| **Required sections** | Title: phase name + "Handoff" — Section "Completed Tasks" (checked checklist, all items checked with green check) — Section "Unresolved Issues" (warning-style list with amber icon, if any) — Section "Next Phase" callout (name + description) — Section "Notes" — "Generated X ago" footer |
| **Language style** | Transitional, forward-looking ("Ready for phase_002"). Unresolved issues use cautious language ("May need attention: ..."). |
| **Null state** | "No handoff generated yet." |

### DecisionCard

| Property | Detail |
|----------|--------|
| **Filenames** | `decision-{id}.json` |
| **Contract artifact** | `decision` |
| **States** | (not state-specific — decision artifacts are created on skip/override/cancel actions) |
| **Required sections** | Title: action name — Reason in blockquote — Phase ID badge (if present) — "Created X ago" footer |
| **Language style** | Minimal. Action as a label ("Phase skipped"), reason as a quoted statement. No editorializing. |
| **Null state** | (not a primary artifact — only shown when explicitly navigated to) |

### AuditCard

| Property | Detail |
|----------|--------|
| **Filenames** | `audit.json` |
| **Contract artifact** | `audit` |
| **States** | (created once during `load_existing_project`, visible at `scope_ready` alongside scope in existing_app mode) |
| **Required sections** | Title "Codebase Audit" — Repo path + framework badges in header — Section "Directory Structure" collapsed tree (default collapsed, max depth 3, `font-mono`) — Section "Entry Points" (bullet list) — Section "Dependencies" (key-value table, top 20, scrollable) — Section "Test Frameworks" (badge list) — Section "Git Info" (branch + last commit SHA) — "Generated X ago" footer |
| **Language style** | Descriptive, factual. Directory structure is verbatim. Dependency versions are factual ("react: ^18.2.0"). |
| **Null state** | "No audit available." (only relevant in existing_app mode) |

### PhaseQueueCard

| Property | Detail |
|----------|--------|
| **Filenames** | `phase-queue.json` |
| **Contract artifact** | `phase-queue` |
| **States** | `phase_queue_ready`, `phase_starting` |
| **Required sections** | Title "Phase Queue" — Progress summary line ("2 of 5 phases complete") — Each phase as a row: name + status badge (current=blue, completed=green, pending=gray, blocked=red, skipped=amber) + description — Current phase visually highlighted with primary border — Phase separators |
| **Language style** | Descriptive, progress-oriented. Status labels are conventional ("In Progress", "Completed", "Pending", "Blocked", "Skipped"). |
| **Null state** | "No phases defined." |

### EmptyStateCard (shared)

Not an artifact card per se — rendered on states with `on_entry_artifact: null` in the contract:

| Property | Detail |
|----------|--------|
| **States** | `starting`, `phase_in_progress`, `phase_blocked`, `project_blocked`, `project_complete`, and all intermediate "in-progress" states (`phase_building`, `phase_reviewing`, `phase_testing`, `phase_fixing`) |
| **Sections** | CardHeader with state label as title — Body message — Optional italic suggested action |
| **Language** | Depending on state: informational ("Project complete"), directional ("Run retry to continue"), or progress ("Build in progress...") |

---

## Stage→Artifact Mapping Table

Maps every contract state to its rendered artifact. `on_entry_artifact: null` states render `EmptyStateCard`.

### Project-level states

| State | Contract `on_entry_artifact` | Filename | Renderer | Empty State Message |
|-------|------------------------------|----------|----------|---------------------|
| `starting` | `null` | — | `EmptyStateCard` | "No project started." |
| `scope_ready` | `scope` | `scope.json` | `ScopeCard` | "No scope defined yet." |
| `master_plan_drafting` | `master-plan` | `master-plan.json` | `MasterPlanCard` | "Generating master plan..." |
| `master_plan_sharpening` | `sharpening-notes` | `sharpening-notes.json` | `SharpeningNotesCard` | "No sharpening notes yet." |
| `phase_queue_ready` | `phase-queue` | `phase-queue.json` | `PhaseQueueCard` | "No phases defined." |
| `phase_in_progress` | `null` | — | `EmptyStateCard` | (delegates to phase state) |
| `phase_handoff` | `handoff` | `handoff-{phase_id}.json` | `HandoffCard` | "No handoff generated yet." |
| `project_blocked` | `null` | — | `EmptyStateCard` | "Project is blocked." |
| `project_complete` | `null` | — | `EmptyStateCard` | "Project complete." |

### Phase-level states

| State | Contract `on_entry_artifact` | Filename | Renderer | Empty State Message |
|-------|------------------------------|----------|----------|---------------------|
| `phase_starting` | `phase-queue` | `phase-queue.json` | `PhaseQueueCard` | "Phase starting..." |
| `phase_plan` | `phase-plan` | `phase-plan-{phase_id}.json` | `PhasePlanCard` | "No phase plan generated yet." |
| `phase_sharpening` | `sharpening-notes` | `sharpening-notes-{phase_id}.json` | `SharpeningNotesCard` | "No sharpening notes yet." |
| `phase_ready_to_build` | `phase-plan` | `phase-plan-{phase_id}.json` | `PhasePlanCard` | "No phase plan available." |
| `phase_building` | `build-summary` | `build-summary-{phase_id}.json` | `BuildSummaryCard` | "Build in progress..." |
| `phase_reviewing` | `review-findings` | `review-findings-{phase_id}.json` | `ReviewFindingsCard` | "Review in progress..." |
| `phase_testing` | `test-results` | `test-results-{phase_id}.json` | `TestResultsCard` | "Testing in progress..." |
| `phase_fixing` | `null` | — | `EmptyStateCard` | "Fixing issues..." |
| `phase_handoff` | `handoff` | `handoff-{phase_id}.json` | `HandoffCard` | "No handoff generated yet." |
| `phase_complete` | `handoff` | `handoff-{phase_id}.json` | `HandoffCard` | "Phase complete." |
| `phase_blocked` | `null` | — | `EmptyStateCard` | "This phase is blocked." |

### Dynamic states (no fixed mapping)

These contract states are auto-transition passthroughs — the machine enters them only briefly during event processing. They never appear as the resting state in `current-state.json`:

- `master_plan_sharpened` — completion target of `draft_complete`
- `phase_sharpened` — completion target of `phase_draft_complete`
- `phase_built` — completion target of `build_complete`
- `phase_reviewed` — completion target of `review_accepted`
- `phase_tested` — completion target of `tests_passed`

If one of these does appear (e.g., due to a crash between event and final write), the `artifact-stage-mapping.ts` should treat it as its predecessor: `phase_sharpened` → same as `phase_sharpening`, `phase_built` → same as `phase_building`, etc. This is a belt-and-suspenders safety net — not expected in normal operation.

---

## EventLog vs. Timeline: Coexistence Model

The EventLog and the Timeline serve different concerns and coexist without overlap:

### EventLog (backend — `/events` API)

```
Storage:   .flowbench/events.ndjson (append-only, one JSON object per line)
API:       GET /api/v1/events?offset=0&limit=50&level=INFO
Purpose:   Durable, authoritative record of every state transition, action attempt,
           and system event. The system of record for "what happened."
Owned by:  services/orchestrator/store/event_log.py
Lifetime:  Persists for the project lifetime. Never deleted. Append-only.
Schema:    { timestamp, level, event, from_state, to_state, actor, description,
             phase_id?, artifact_type? }
Levels:    INFO, WARNING, ERROR (set by the emitting code)
```

### Timeline (frontend — UI component)

```
File:      apps/web/src/components/project-timeline.tsx
API:       Reads from GET /api/v1/events (same endpoint)
Purpose:   Convenience view — paginated, filterable, human-readable event stream.
           Shows the user what happened in reverse chronological order.
           Not the source of truth — a consumer of the EventLog.
Lifecycle: Renders only when the component is mounted. No local persistence.
Features:  Level filter tabs (All / Info / Warning / Error), "Load more"
           pagination (50 per page), relative timestamps, level badges.
```

### Key distinctions

| Concern | EventLog | Timeline |
|---------|----------|----------|
| **Role** | Source of truth | Consumer view |
| **Location** | Backend filesystem | Frontend component |
| **Data** | All events, all levels | Paginated subset, filtered |
| **Format** | NDJSON rows | Formatted Card rows |
| **State** | Never modifies state | Read-only display |
| **Lifecycle** | Project lifetime | Component mount |

### How they coexist

1. **No duplication of data.** The EventLog is the single source. The Timeline is a transient view. The `/events` API is the only bridge.

2. **No event data in artifacts.** Events and artifacts are separate concerns:
   - **Artifacts** = durable outputs of adapter execution (scope files, plans, build results, handoffs). Rendered as detailed cards in the Artifact Panel. These are *what was produced*.
   - **Events** = records of *what happened* (state transitions, action attempts, system events). Displayed as compact rows in the Timeline. These are *what occurred*.

3. **No cross-referencing in Phase 4.** A future phase could add event-to-artifact links (e.g., clicking a timeline event opens the associated artifact), but Phase 4 keeps them independent.

4. **No event writing from the frontend.** The Timeline component never POSTs to any endpoint. All event writes happen server-side in `engine/` and `services/` code.

---

## Implementation Tasks

### B1 — Add `sharpening-notes` to phase-specific artifact regex

**File:** `services/orchestrator/api/state.py`

Add `sharpening-notes` to the regex alternation so `sharpening-notes-phase_001.json` resolves instead of returning 404:

```
(phase-plan|build-summary|review-findings|test-results|handoff|decision|sharpening-notes)
```

Also add `"sharpening-notes"` to the `ALLOWED_ARTIFACTS` set's fixed-files comment to document both levels are supported.

**Verify:** `GET /api/v1/artifacts/sharpening-notes-phase_001.json` returns data (if exists) instead of 404.

---

### F1 — Add fetch functions to api.ts

**File:** `apps/web/src/lib/api.ts`

Add types:

```ts
interface EventEntry {
  timestamp: string;
  level: string;
  event: string;
  from_state?: string;
  to_state?: string;
  actor: string;
  description: string;
  phase_id?: string;
  artifact_type?: string;
}

interface EventsResponse {
  events: EventEntry[];
  total: number;
  offset: number;
  limit: number;
}
```

Add functions:

```ts
fetchEvents(offset = 0, limit = 50, level?: string): Promise<EventsResponse>
fetchArtifact(filename: string): Promise<Record<string, unknown> | null>
```

`fetchArtifact` replaces the inline `fetch` + error handling in `artifact-panel.tsx`.

---

### F2 — Create artifact-stage-mapping library

**File:** `apps/web/src/lib/artifact-stage-mapping.ts` (new)

Define the mapping from contract `on_entry_artifact`:

```ts
interface ArtifactMapping {
  artifactKey: string;
  filename: string | null;       // null means no artifact (empty state)
  rendererName: string;          // component name for dynamic resolution
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
  // Phase execution states — artifacts are phase-specific
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
  // Blocked states — show empty state with retry suggestion
  phase_fixing: {
    artifactKey: "findings",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "Fixing issues...",
  },
  phase_blocked: {
    artifactKey: "blocked",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "This phase is blocked.",
    suggestedAction: "Run retry or fix_failures to continue.",
  },
  project_blocked: {
    artifactKey: "blocked",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "Project is blocked.",
    suggestedAction: "Run retry to continue.",
  },
  project_complete: {
    artifactKey: "complete",
    filename: null,
    rendererName: "EmptyStateCard",
    emptyMessage: "Project complete.",
  },
};

// States with on_entry_artifact: null — render EmptyStateCard
const NULL_ARTIFACT_STATES = new Set([
  "starting",
  "phase_in_progress",
  "project_blocked",
  "project_complete",
  "phase_fixing",
  "phase_blocked",
]);
```

Export:

```ts
export function getMapping(state: string): ArtifactMapping | null
export function resolveFilename(state: string, phaseId?: string): string | null
```

---

### F3 — Create `useCurrentArtifact` hook

**File:** `apps/web/src/hooks/use-current-artifact.ts` (new)

- Takes state data (project state + phase state) from `useProjectState()` (passed in or accessed via context)
- Resolves the effective state key: use `current_phase_state` if set, else `project_state`
- Calls `resolveFilename()` from F2
- Calls `fetchArtifact()` if filename resolved
- Returns `{ data, artifactKey, isLoading, isError, mapping }`
- 5s polling interval

```ts
import { useQuery } from "@tanstack/react-query";
import { fetchArtifact } from "@/lib/api";
import { getMapping, resolveFilename } from "@/lib/artifact-stage-mapping";

export function useCurrentArtifact(state: { project_state: string; current_phase_state?: string | null; current_phase_id?: string | null } | null) {
  const effectiveState = state?.current_phase_state || state?.project_state || null;

  return useQuery({
    queryKey: ["artifact", effectiveState, state?.current_phase_id],
    queryFn: async () => {
      if (!effectiveState) return { data: null, mapping: null };
      const mapping = getMapping(effectiveState);
      if (!mapping) return { data: null, mapping: null };
      const filename = resolveFilename(effectiveState, state?.current_phase_id ?? undefined);
      if (!filename) return { data: null, mapping };
      const data = await fetchArtifact(filename);
      return { data, mapping };
    },
    refetchInterval: 5000,
    enabled: !!effectiveState,
  });
}
```

---

### F4 — Create `useEvents` hook

**File:** `apps/web/src/hooks/use-events.ts` (new)

- Uses `useInfiniteQuery` from `@tanstack/react-query`
- `queryFn: ({ pageParam }) => fetchEvents(pageParam, 50, level)`
- `getNextPageParam`: returns `offset + 50` if `offset + limit < total`, else `undefined`
- `level` filter state (default `null` = all)
- Resets pages when level changes
- Returns `{ events, total, hasMore, loadMore, level, setLevel, isLoading }`
- 10s polling (`refetchInterval: 10000`)

```ts
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchEvents } from "@/lib/api";
import { useState } from "react";

export function useEvents() {
  const [level, setLevel] = useState<string | undefined>(undefined);

  const query = useInfiniteQuery({
    queryKey: ["events", level],
    queryFn: async ({ pageParam = 0 }) => fetchEvents(pageParam, 50, level),
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.limit;
      return next < lastPage.total ? next : undefined;
    },
    initialPageParam: 0,
    refetchInterval: 10000,
  });

  const events = query.data?.pages.flatMap((p) => p.events) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    events,
    total,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    level,
    setLevel: (l: string | undefined) => {
      setLevel(l);
      query.refetch();
    },
    isLoading: query.isLoading,
  };
}
```

---

### F5 — Create 11 artifact renderer components

**Directory:** `apps/web/src/components/artifacts/` (new)

Each renders its artifact as a shadcn/ui `Card` with `CardHeader`/`CardContent`. All text HTML-escaped by React.

#### F5a — `scope-card.tsx`

Schema: `{ content: string, updated_at: string }`

```tsx
export function ScopeCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Scope</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="whitespace-pre-wrap font-mono text-xs">
          {String(data.content ?? "")}
        </p>
        {data.updated_at && (
          <p className="text-xs text-muted-foreground">
            Updated {formatRelative(String(data.updated_at))}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

#### F5b — `master-plan-card.tsx`

Schema: `{ project: string, total_phases: number, phases: Array<{name: string, description: string}>, architecture_decisions: string[], generated_at: string }`

- Title: project name
- Total phases count badge
- Phases as numbered list with descriptions
- Architecture decisions as bullet list
- Generated timestamp (relative)

#### F5c — `sharpening-notes-card.tsx`

Schema: `{ rounds: Array<{prompt: string, feedback: string}>, updated_at: string }`

- Each round as a sub-card with prompt and feedback fields
- Collapsed by default — show first round expanded
- "Round N of M" header per round

#### F5d — `phase-plan-card.tsx`

Schema: `{ phase_name: string, phase_id: string, summary: string, estimated_complexity: string, dependencies: string[], success_criteria: string[], sub_tasks: Array<{id: string, description: string}>, generated_at: string }`

- Phase name as title with complexity badge
- Summary paragraph
- Dependencies as tag list
- Success criteria as checkmark checklist
- Sub-tasks as numbered list
- Generated timestamp

#### F5e — `build-summary-card.tsx`

Schema: `{ status: string, files_created: string[], files_modified: string[], files_deleted: string[], summary: string, completed_at: string }`

- Status as color-coded Badge (success=green, failure=red)
- File counts with expandable lists
- Summary paragraph
- Completed timestamp

#### F5f — `review-findings-card.tsx`

Schema: `{ summary: string, findings: Array<{severity: string, description: string, file?: string}>, completed_at: string }`

- Summary as lead paragraph
- Findings table: severity badge + description + file
- Severity colors: critical=red, warning=amber, info=blue
- Completed timestamp

#### F5g — `test-results-card.tsx`

Schema: `{ passed: number, failed: number, skipped: number, details: Array<{name: string, status: string, message?: string}>, summary: string, completed_at: string }`

- Pass/fail/skipped counts as color-coded badges
- Summary line
- Details list with status icon per test
- Failed test messages in red detail
- Completed timestamp

#### F5h — `handoff-card.tsx`

Schema: `{ phase_name: string, completed_tasks: string[], unresolved_issues: string[], next_phase_name: string, notes: string, generated_at: string }`

- Phase name title
- Completed tasks checklist (all checked)
- Unresolved issues as warning list
- Next phase callout
- Notes section
- Generated timestamp

#### F5i — `decision-card.tsx`

Schema: `{ action: string, reason: string, phase_id?: string, created_at: string }`

- Action as title
- Reason as blockquote
- Phase ID badge (if present)
- Created timestamp

#### F5j — `audit-card.tsx`

Schema: `{ repo_path: string, framework: string, directory_structure: string[], entry_points: string[], dependencies: Record<string, string>, test_frameworks: string[], git_info: {branch: string, last_commit: string}, generated_at: string }`

- Repo path and framework as header badges
- Directory structure as collapsible tree (default collapsed, max depth 3)
- Entry points list
- Dependencies as key-value table (truncated to top 20)
- Test frameworks badges
- Git info: branch + last commit SHA
- Generated timestamp

#### F5k — `phase-queue-card.tsx`

Reads from `phase-queue.json`:

Schema: `{ phases: Array<{id: string, name: string, status: string, description: string}>, current_phase_id: string, total_progress: string }`

- All phases with status badges (current=blue, completed=green, pending=gray, blocked=red)
- Current phase highlighted
- Progress summary line
- Phase descriptions expanded

#### F5l — Barrel export

**File:** `apps/web/src/components/artifacts/index.ts`

```ts
export { ScopeCard } from "./scope-card";
export { MasterPlanCard } from "./master-plan-card";
export { SharpeningNotesCard } from "./sharpening-notes-card";
export { PhasePlanCard } from "./phase-plan-card";
export { BuildSummaryCard } from "./build-summary-card";
export { ReviewFindingsCard } from "./review-findings-card";
export { TestResultsCard } from "./test-results-card";
export { HandoffCard } from "./handoff-card";
export { DecisionCard } from "./decision-card";
export { AuditCard } from "./audit-card";
export { PhaseQueueCard } from "./phase-queue-card";
export { EmptyStateCard } from "./empty-state-card";
```

**EmptyStateCard** is a shared component:

```tsx
export function EmptyStateCard({
  title,
  message,
  suggestedAction,
}: {
  title: string;
  message: string;
  suggestedAction?: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{message}</p>
        {suggestedAction && (
          <p className="text-xs italic">{suggestedAction}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

**Consistent pattern across all artifact cards:**

```tsx
export function FooCard({ data }: { data: Record<string, unknown> }) {
  if (!data) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Title</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* formatted fields only — no raw JSON */}
      </CardContent>
    </Card>
  );
}
```

---

### F6 — Rewrite `artifact-panel.tsx`

**File:** `apps/web/src/components/artifact-panel.tsx`

Replace inline logic:

1. Import `useCurrentArtifact` hook
2. Import artifact renderer map and `getMapping` from F2
3. Import all 11 renderers from artifacts barrel
4. Resolve renderer component via mapping `rendererName`
5. Render the matched card with `data` from hook
6. For null-mapping states (no `on_entry_artifact`), render `EmptyStateCard`:
   - Uses `project_state_label` / `current_phase_state_label` as title
   - Shows `suggestedAction` from mapping if available, or generic message
7. Remove inline `STATE_ARTIFACT_MAP`, `deriveArtifactFilename`, raw `fetch`, and `JSON.stringify`

Keeps:
- Header bar ("Artifact" title)
- ScrollArea wrapping
- Loading skeletons (shadcn/ui Skeleton)
- "No project" state

**Renderer resolution:**

```tsx
const RENDERER_MAP: Record<string, React.ComponentType<{ data: Record<string, unknown> }>> = {
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
};

function ArtifactPanel() {
  const { data: state } = useProjectState();
  const { data: artifact, isLoading } = useCurrentArtifact(state);

  // ... loading skeleton, no-project state ...

  const mapping = artifact?.mapping;
  const Renderer = mapping ? RENDERER_MAP[mapping.rendererName] : null;

  if (!Renderer) return <EmptyStateCard title="Artifact" message="No artifact available." />;

  if (mapping?.filename === null) {
    return (
      <EmptyStateCard
        title={mapping.artifactKey}
        message={mapping.emptyMessage}
        suggestedAction={mapping.suggestedAction}
      />
    );
  }

  return <Renderer data={artifact?.data ?? {}} />;
}
```

---

### F7 — Create `project-timeline.tsx`

**File:** `apps/web/src/components/project-timeline.tsx` (new)

Bottom panel layout:

```
┌─ Timeline ────┬─ [All] [Info] [Warning] [Error] ────────┐
│ 2m ago  INFO  project_created  — Project created         │
│ 5m ago  WARN  phase_build_paused — Build paused by user  │
│ ...                                                       │
│ [Load more (12 of 47)]                                    │
└───────────────────────────────────────────────────────────┘
```

- Header: "Timeline" label + level filter tabs (All, Info, Warning, Error)
- Uses `useEvents()` hook
- Each row: `relativeTime(timestamp)` + level `Badge` + event name (semibold) + description
- "Load more" button at bottom, hidden when `!hasMore`
- Shows `total` count: "N of M events"
- Empty state: "No events yet."
- Uses ScrollArea (max-height 250px)
- Uses `Intl.RelativeTimeFormat` for relative timestamps, `Intl.DateTimeFormat` for absolute on hover/title attribute

**Relative time utility (inline or in `lib/utils.ts`):**

```ts
function formatRelative(iso: string): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return rtf.format(-days, "day");
  if (hours > 0) return rtf.format(-hours, "hour");
  if (minutes > 0) return rtf.format(-minutes, "minute");
  return rtf.format(-seconds, "second");
}
```

**Level filter tabs:**

```tsx
const LEVEL_TABS = [
  { label: "All", value: undefined },
  { label: "Info", value: "INFO" },
  { label: "Warning", value: "WARNING" },
  { label: "Error", value: "ERROR" },
];
```

---

### F8 — Update page layout

**File:** `apps/web/src/app/page.tsx`

Add `ProjectTimeline` below the three-pane area:

```tsx
export default function Home() {
  return (
    <main className="flex flex-col h-screen min-w-[1280px]">
      <ProjectHeader />
      <div className="flex flex-1 overflow-hidden">
        <PhaseQueue className="w-[220px] min-w-[220px] border-r shrink-0" />
        <ArtifactPanel className="flex-1 min-w-0" />
        <CommandPane className="w-[280px] min-w-[280px] border-l shrink-0" />
      </div>
      <ProjectTimeline />
    </main>
  );
}
```

`ProjectTimeline` component internally handles no-project state (shows empty/minimal variant with no events message).

---

## Acceptance Checks

| # | Check | Verification |
|---|-------|-------------|
| 1 | Each artifact type renders a formatted card | Walk all 10 schemas: scope, master-plan, sharpening-notes, phase-plan, build-summary, review-findings, test-results, handoff, decision, audit |
| 2 | Phase queue renders as detailed PhaseQueueCard | Verify at `phase_queue_ready` and `phase_starting` |
| 3 | Auto-selection matches contract for every state | Cross-reference each state with `on_entry_artifact` in workflow-contract.json |
| 4 | Empty states show suggested action on null-artifact states | `starting`, `phase_in_progress`, `project_blocked`, `project_complete`, `phase_fixing`, `phase_blocked` |
| 5 | Timeline shows 50 events per page, "Load more" works | Add >50 events, verify pagination |
| 6 | Level filter works | Click each tab, verify filtered results |
| 7 | No raw JSON in artifact panel | `JSON.stringify` removed from `artifact-panel.tsx` |
| 8 | Phase-level `sharpening-notes-{phase_id}.json` served by backend | `GET /api/v1/artifacts/sharpening-notes-phase_001.json` returns 200 |
| 9 | `npm run build` passes | Type-check + compile |
| 10 | `pytest` passes, ruff clean | All tests pass |

---

## File Change Summary

| # | File | Action |
|---|------|--------|
| B1 | `services/orchestrator/api/state.py` | Edit — add `sharpening-notes` to regex |
| F1 | `apps/web/src/lib/api.ts` | Edit — add `EventEntry`, `fetchEvents()`, `fetchArtifact()` |
| F2 | `apps/web/src/lib/artifact-stage-mapping.ts` | **New** — 120 lines |
| F3 | `apps/web/src/hooks/use-current-artifact.ts` | **New** — 35 lines |
| F4 | `apps/web/src/hooks/use-events.ts` | **New** — 45 lines |
| F5a | `apps/web/src/components/artifacts/scope-card.tsx` | **New** |
| F5b | `apps/web/src/components/artifacts/master-plan-card.tsx` | **New** |
| F5c | `apps/web/src/components/artifacts/sharpening-notes-card.tsx` | **New** |
| F5d | `apps/web/src/components/artifacts/phase-plan-card.tsx` | **New** |
| F5e | `apps/web/src/components/artifacts/build-summary-card.tsx` | **New** |
| F5f | `apps/web/src/components/artifacts/review-findings-card.tsx` | **New** |
| F5g | `apps/web/src/components/artifacts/test-results-card.tsx` | **New** |
| F5h | `apps/web/src/components/artifacts/handoff-card.tsx` | **New** |
| F5i | `apps/web/src/components/artifacts/decision-card.tsx` | **New** |
| F5j | `apps/web/src/components/artifacts/audit-card.tsx` | **New** |
| F5k | `apps/web/src/components/artifacts/phase-queue-card.tsx` | **New** |
| F5l | `apps/web/src/components/artifacts/index.ts` | **New** — barrel |
| F5m | `apps/web/src/components/artifacts/empty-state-card.tsx` | **New** |
| F6 | `apps/web/src/components/artifact-panel.tsx` | Rewrite |
| F7 | `apps/web/src/components/project-timeline.tsx` | **New** — 130 lines |
| F8 | `apps/web/src/app/page.tsx` | Edit — add timeline |

**1 backend file, 20 frontend files (14 new, 3 modified, 1 barrel).**
