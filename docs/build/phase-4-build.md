# Phase 4 — Artifacts and Timeline: Formatted Cards, Paginated Event Log

**Plan**: `../plan/phase-4-plan.md`

**Status**: Implemented. Raw JSON artifact rendering replaced with 11 formatted plain-English cards, paginated timeline with level-filtered event log, stage-to-artifact mapping aligned with workflow contract.

## Architecture

```
page.tsx
  ├── ProjectHeader (unchanged)
  ├── PhaseQueue sidebar (unchanged)
  ├── ArtifactPanel (rewritten)
  │     ├── useProjectState() → current state
  │     ├── useCurrentArtifact(state) → fetches artifact via mapping
  │     │     ├── artifact-stage-mapping.ts → getMapping() + resolveFilename()
  │     │     └── fetchArtifact() → GET /api/v1/artifacts/{filename}
  │     └── RENDERER_MAP → resolves renderer by mapping.rendererName
  │           ├── ScopeCard / MasterPlanCard / SharpeningNotesCard / ...
  │           └── EmptyStateCard (direct, not in map)
  ├── CommandPane (unchanged)
  └── ProjectTimeline (new)
        ├── useEvents() → useInfiniteQuery → GET /api/v1/events
        ├── Level filter tabs (All / Info / Warning / Error)
        └── "Load more" pagination (50/page)
```

### Card rendering model

Each artifact card follows: `Card > CardHeader (title + meta) > CardContent (sectioned, text-sm)`. Timestamps use `Intl.RelativeTimeFormat` with absolute date on `title` attribute. Null/missing fields are skipped via `String(field ?? "")` — never shown as "undefined".

### State→artifact resolution

`artifact-stage-mapping.ts` maps every contract state to its artifact (filename, renderer, empty-state message). Phase-specific filenames use `{phase_id}` token. Static fallback mapping handles dynamic passthrough states (`phase_built` → `phase_building`, etc.). `resolveFilename()` interpolates `phase_id` when present.

## New Files (13)

| File | Purpose |
|------|---------|
| `apps/web/src/lib/artifact-stage-mapping.ts` | Contract state→artifact mapping with dynamic fallback |
| `apps/web/src/hooks/use-current-artifact.ts` | 5s-polling hook: resolves state → filename → fetches artifact |
| `apps/web/src/hooks/use-events.ts` | `useInfiniteQuery` hook with 10s polling and level filtering |
| `apps/web/src/components/artifacts/empty-state-card.tsx` | Shared empty state card with title, message, optional suggestion |
| `apps/web/src/components/artifacts/scope-card.tsx` | Verbatim scope content in monospace |
| `apps/web/src/components/artifacts/master-plan-card.tsx` | Project name, phase count, numbered phases, architecture decisions |
| `apps/web/src/components/artifacts/sharpening-notes-card.tsx` | Collapsible rounds (first expanded), prompt+feedback per round |
| `apps/web/src/components/artifacts/phase-plan-card.tsx` | Phase name + complexity badge, dependencies, criteria checklist, sub-tasks |
| `apps/web/src/components/artifacts/build-summary-card.tsx` | Status badge, file lists with expandable counts |
| `apps/web/src/components/artifacts/review-findings-card.tsx` | Severity-badged findings with file paths |
| `apps/web/src/components/artifacts/test-results-card.tsx` | Pass/fail/skipped badges, detail list with status icons |
| `apps/web/src/components/artifacts/handoff-card.tsx` | Completed tasks, unresolved issues, next phase callout, notes |
| `apps/web/src/components/artifacts/decision-card.tsx` | Action label, reason blockquote, phase ID badge |
| `apps/web/src/components/artifacts/audit-card.tsx` | Repo path, framework, dir tree, entry points, dependency table, git info |
| `apps/web/src/components/artifacts/phase-queue-card.tsx` | All phases with status badges, current phase highlighted, separators |
| `apps/web/src/components/artifacts/index.ts` | Barrel export for all artifact cards |
| `apps/web/src/components/project-timeline.tsx` | Paginated event log with level filter tabs, ScrollArea, "Load more" |

## Modified Files (4)

| File | Change |
|------|--------|
| `services/orchestrator/api/state.py` | Added `sharpening-notes` to phase-specific artifact regex; documented both levels in comment |
| `apps/web/src/lib/api.ts` | Added `EventEntry`, `EventsResponse`, `fetchEvents()`, `fetchArtifact()` |
| `apps/web/src/lib/utils.ts` | Added `formatRelative()` using `Intl.RelativeTimeFormat` |
| `apps/web/src/components/artifact-panel.tsx` | Rewritten: removed inline `STATE_ARTIFACT_MAP`, raw JSON rendering, `JSON.stringify`; replaced with `useCurrentArtifact` + dynamic renderer resolution |
| `apps/web/src/app/page.tsx` | Added `ProjectTimeline` below the three-pane layout |

## Key Components

### artifact-stage-mapping.ts

Core mapping library. `getMapping(state)` resolves any contract state (including dynamic passthroughs like `phase_built`) to an `ArtifactMapping` with filename, renderer name, and empty-state message. `resolveFilename(state, phaseId?)` interpolates `{phase_id}` for phase-specific artifacts.

21 states mapped: 5 project-level, 11 phase-level, 5 blocked/completion states. Dynamic fallback covers 5 auto-transition passthroughs (`master_plan_sharpened`, `phase_sharpened`, `phase_built`, `phase_reviewed`, `phase_tested`).

### useCurrentArtifact hook

Accepts state data from `useProjectState()`, resolves effective state (`current_phase_state` > `project_state`), calls `resolveFilename()` then `fetchArtifact()`. Uses `useQuery` with 5s `refetchInterval`. Returns `{ data, mapping }`.

### useEvents hook

Uses `useInfiniteQuery` with 10s polling. Level filter state (`undefined` = all) is part of query key so React Query resets pages on change. `getNextPageParam` computes `offset + 50` when under total count.

### ProjectTimeline component

- Header row: "Timeline" label + level filter tabs (All, Info, Warning, Error)
- Each event row: relative timestamp + level badge + event name (semibold) + description
- Rows have absolute datetime in `title` attribute for hover
- "Load more" button at bottom showing "N of M events" count
- Empty state: "No events yet."
- Wraps in `ScrollArea` (`max-h-[250px]`)

### Artifact card patterns

All cards share:
- `export function FooCard({ data }: { data: Record<string, unknown> })` signature
- `Card > CardHeader(CardTitle) > CardContent` structure
- Fields extracted as typed variables at the top of the component
- Empty/null fields skipped via empty-string check (not `&&` with `unknown`)
- `formatRelative()` for timestamps
- No raw JSON output, no `JSON.stringify`

## Backend Change

`state.py`: The `ALLOWED_ARTIFACTS` set now has a comment documenting sharpening-notes at both project and phase levels. The regex for phase-specific artifacts includes `sharpening-notes` so `GET /api/v1/artifacts/sharpening-notes-phase_001.json` resolves instead of returning 404.

## Test Coverage

- **174 tests pass** (unchanged from Phase 3 — no backend logic added)
- **Ruff clean** — no lint errors
- **Build** — `npm run build` passes with 0 errors

## Review Findings and Fixes

A post-implementation review against the approved plan identified 12 issues. All were corrected:

| # | Issue | Fix |
|---|-------|------|
| 1 | `EmptyStateCard` not in `RENDERER_MAP` (type mismatch — different prop signature) | Removed from map; null-filename states rendered via direct `<EmptyStateCard>` call |
| 2 | `Renderer && mapping?.filename === null` — when `Renderer` was null (no EmptyStateCard in map), null-filename states hit generic fallback | Changed to `mapping && (mapping.filename === null \|\| artifact?.data === null)` |
| 3 | In-progress states (`phase_building`, `phase_reviewing`, `phase_testing`) with null fetch showed generic card instead of empty message like "Build in progress..." | Added `\|\| artifact?.data === null` to the EmptyStateCard condition |
| 4 | `useEvents` `setLevel` called `query.refetch()` — triggered double fetch since query key change already refetches | Removed redundant `query.refetch()` |
| 5 | `SharpeningNotesCard` returned `null` when `rounds.length === 0`, hiding the card entirely | Removed early return |
| 6 | `SharpeningNotesCard` missing `updated_at` timestamp from spec | Added `updatedAt` extraction and "Updated X ago" footer |
| 7 | `TestResultsCard` returned `null` when `passed + failed + skipped === 0`, hiding the card for zero-count results | Removed early return |
| 8 | `PhaseQueueCard` status keys (`current`, `completed`, `pending`) didn't match actual backend values (`in_progress`, `complete`, `upcoming`) | Changed keys to match backend format; fixed `completeCount` filter |
| 9 | `PhaseQueueCard` completed badge used default (blue) variant instead of green per spec | Added green className override |
| 10 | `MasterPlanCard` used `phases.length` for badge instead of authoritative `total_phases` field | Added `totalPhases = Number(data.total_phases ?? 0)` |
| 11 | `ALLOWED_ARTIFACTS` in `state.py` had no comment documenting phase-level sharpening-notes support | Added doc comment |
| 12 | `getMapping` imported but never used in `artifact-panel.tsx` | Removed unused import |

### Not Implemented (Deferred)

| Requirement | Reason |
|-------------|--------|
| ReviewFinding rendered as a table (spec line ~653) | Stacked card layout is equivalent — table styling not critical |
| AuditCard directory structure "max depth 3" | Data is a flat `string[]` from backend; depth cannot be determined frontend-side |
| SharpeningNotesCard "accent border on unresolved rounds" | Schema has no `resolved` field; blocked by "no schema changes" non-goal |
| `useCurrentArtifact` return `artifactKey` and `isError` | Not consumed by any caller; no behavioral impact |

## Deferred Boundaries

| Feature | Phase | Current Status |
|---------|-------|----------------|
| Full golden path test (init → complete phase) | 4+ | Individual actions tested in Phase 3; end-to-end not yet composed |
| Timeline collapsibility toggle | 5 | Deferred per plan |
| `view_handoff_notes` / `view_summary` wiring | 7 | Deferred per plan |
| Keyboard/ARIA for timeline | 5 | Deferred per plan |
| Event-to-artifact cross-referencing (click event → open associated artifact) | Future | Phase 4 keeps them independent per spec |
