# Phase 2 — Implementation & Handoff

**Phase 2 commit**: `3dc890e`

**Plan**: `phase-2-implementation-plan.md`

**Status**: Implemented. Three-pane console UI with shell, navigation, risk confirmation dialog, placeholder artifact area, phase queue, and dark mode toggle. Backend additions for phase queue, artifact serving, state labels, action labels, and initial project bootstrap.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ PROJECT HEADER (name, state labels, phase ID, progress, 🌙) │
├────────────┬──────────────────────────┬───────────────────────┤
│ PHASE      │ ARTIFACT PANEL           │ COMMAND PANE          │
│ QUEUE      │ (raw JSON or             │ (stage-aware action    │
│ (220px,    │  "No artifact yet")      │  buttons, risk dialog, │
│ color      │                          │  scope input)          │
│ badges)    │                          │                        │
└────────────┴──────────────────────────┴───────────────────────┘
```

- **Single page app** (no routing), minimum 1280px viewport
- **Next.js 14** with `"use client"` components, `@tanstack/react-query` for data fetching, `next-themes` for dark mode
- **shadcn/ui** primitives (Button, Card, Badge, ScrollArea, Separator, Skeleton, Toast, Dialog)
- **Backend labels** single-sourced: `project_state_label`/`current_phase_state_label` from `PRODUCT_LABELS`, action labels from `ACTION_LABELS`

## Frontend Components

### Base Layer

| File | Purpose |
|------|---------|
| `package.json` | 10 added dependencies (`@tanstack/react-query`, `next-themes`, Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss-animate`) |
| `tailwind.config.ts` | `darkMode: "class"`, shadcn/ui HSL color tokens, `tailwindcss-animate` plugin |
| `tsconfig.json` | `baseUrl: "."`, `paths: { "@/*": ["./src/*"] }` |
| `globals.css` | shadcn/ui CSS variables (light + dark), `@apply border-border` |
| `components.json` | shadcn/ui project config |
| `providers.tsx` | `QueryClientProvider` + `ThemeProvider` (class-based) + `Toaster` |
| `src/lib/utils.ts` | `cn()` utility (`clsx` + `tailwind-merge`) |

### Data Layer

| File | Purpose |
|------|---------|
| `src/lib/api.ts` | Typed `fetchState`, `fetchActions`, `postAction` wrappers; `safeLabel()` fallback (underscores → title case); error response handling |
| `src/hooks/use-project-state.ts` | Adaptive polling: `updated_at` comparison → 2s on change, 5s idle |
| `src/hooks/use-actions.ts` | Actions fetch; invalidated after every POST |
| `src/hooks/use-phase-queue.ts` | Phase queue fetch; 10s poll |

### UI Components

| File | Purpose |
|------|---------|
| `src/components/ui/button.tsx` | shadcn/ui Button (default, destructive, outline, secondary, ghost, link; sm, default, lg, icon) |
| `src/components/ui/card.tsx` | shadcn/ui Card (Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent) |
| `src/components/ui/badge.tsx` | shadcn/ui Badge (default, secondary, destructive, outline) |
| `src/components/ui/scroll-area.tsx` | ScrollArea wrapper (`overflow-auto`) |
| `src/components/ui/separator.tsx` | Separator divider (`h-[1px] bg-border`) |
| `src/components/ui/skeleton.tsx` | Loading skeleton (`animate-pulse rounded-md bg-muted`) |
| `src/components/ui/toast.tsx` | Toast system (context-based; `toast()`, `useToast()`, `Toaster`; auto-dismiss 5s) |
| `src/components/ui/dialog.tsx` | shadcn/ui Dialog (Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogOverlay) |

### App Components

| File | Purpose |
|------|---------|
| `project-header.tsx` | Sticky header: project display name, state label(s), phase ID, phase progress, dark mode toggle (Sun/Moon via `next-themes`); skeleton during loading; "No project" state |
| `command-pane.tsx` | Right pane: **no-project state** → scope textarea + Create button; **project state** → actions grouped by type (Project actions / Risky actions / Navigation / Execution), each button shows backend-sourced `label`; non-risky system → POST immediately; risky system → opens risk dialog; navigation → client-side only (`view_all_phases` scrolls queue); adapter → POST + toast with backend `message` verbatim; `reloadAll()` after every POST unconditionally |
| `risk-confirmation-dialog.tsx` | shadcn/ui Dialog: title = action label, body = risk explanation; Cancel (no-op) / Proceed (POST with `confirmed:true`); loading spinner on Proceed; error message keeps dialog open; re-fetches state+actions even on error |
| `artifact-panel.tsx` | Center pane: phase-state precedence rule (`current_phase_state` takes priority over `project_state`); stage-to-artifact mapping → fetches from `GET /api/v1/artifacts/{filename}`; renders JSON in HTML-escaped `<pre>` block; "No artifact yet" / "Start a project to begin." empty states |
| `phase-queue.tsx` | Left pane (220px): fetches from `GET /api/v1/phase-queue`; status badges: upcoming=gray, in_progress=blue, complete=green, blocked=red, skipped=yellow; empty states for no-project and no-phases |

### Page Assembly

`src/app/page.tsx` — three-pane layout:
```tsx
<main className="flex flex-col h-screen min-w-[1280px]">
  <ProjectHeader />
  <div className="flex flex-1 overflow-hidden">
    <PhaseQueue className="w-[220px] min-w-[220px] border-r shrink-0" />
    <ArtifactPanel className="flex-1 min-w-0" />
    <CommandPane className="w-[280px] min-w-[280px] border-l shrink-0" />
  </div>
</main>
```

## Backend Additions

### B1 — `GET /api/v1/phase-queue` (`state.py`)

Reads `.flowbench/phase-queue.json`, normalizes list vs `{"phases": [...]}` format, returns `{"phase_queue": [...], "total": N}`. Empty if file missing.

### B2 — `GET /api/v1/artifacts/{filename}` (`state.py`)

Explicit allowlist of displayable artifact filenames:
- Fixed: `scope.json`, `master-plan.json`, `sharpening-notes.json`, `phase-queue.json`, `audit.json`
- Pattern: `(phase-plan|build-summary|review-findings|test-results|handoff|decision)-phase_\d{3}\.json`
- Non-allowlisted and non-existent → 404 (no distinction, path-probing resistant)
- Secondary guard: `FileStore._validate_path()` ensures resolved path stays under `.flowbench/`

### B3 — State labels in `GET /api/v1/state` (`state.py`)

Adds `project_state_label` and `current_phase_state_label` from `PRODUCT_LABELS`. Uses `_safe_label()` fallback: replaces underscores with spaces, title-cases (e.g. `"scope_ready"` → `"Scope Ready"`). Never exposes raw snake_case state names.

### B4 — Initial project bootstrap (`actions.py`)

When `start_new_project` is called with no `current-state.json`, creates an in-memory `CurrentState` with `project_state: "starting"`, lets the normal transition flow write the final state file. Eliminates the chicken-and-egg problem on fresh installs.

### B5 — No router registration change needed

Both new endpoints live on the existing `state.py` router, auto-registered via `app.include_router(state_router, prefix="/api/v1")`.

### B6 — Action labels from `ACTION_LABELS` (`actions.py`)

Both `GET /actions` and `POST /actions/{action}` resolve labels via `_resolve_label()` with this priority chain:
1. `ACTION_LABELS[action_name]` — single-sourced from `state_machine.py`
2. `actions.json` `label` field (if non-empty)
3. Title-cased fallback: underscores → spaces, title-case (defense-in-depth, never raw snake_case)

`actions.json` remains the source for `description`, `risk_category`, `risk_explanation`, and `action_type`.

## UI Behavior Matrix

| User Action | System Action (no risk) | System Action (risky) | Navigation Action | Adapter Action |
|---|---|---|---|---|
| Click button | POST immediately → re-fetch `/state` + `/actions` unconditionally | Open risk dialog → POST on approve → re-fetch unconditionally | Client-side only (highlight pane, no POST, no toast) | POST → toast with backend `message` verbatim → re-fetch |
| Dialog appears | N/A | Yes, with risk explanation | N/A | N/A |
| Reject in dialog | N/A | Close dialog, no-op | N/A | N/A |
| Approve in dialog | N/A | POST with `confirmed:true` → re-fetch unconditionally (even on error) | N/A | N/A |
| POST fails | Show error toast + re-fetch | Show error toast + keep dialog open + re-fetch | N/A | N/A |
| State changes | Detected by re-fetched responses, not assumed locally | Same | N/A | N/A |

## Label Sourcing Chain

All user-facing labels follow this priority chain, applied at both the backend API and frontend:

1. `ACTION_LABELS` / `PRODUCT_LABELS` — single-sourced from `state_machine.py`
2. `actions.json` `label` field (action labels only)
3. Safe fallback: replace underscores with spaces, title-case (never raw internal name)

The backend `_resolve_label()` and `_safe_label()` functions apply the chain at the API layer. The frontend `safeLabel()` in `api.ts` adds defense-in-depth — all three layers are consistent.

## Navigation Action Outcomes

Every navigation action is client-side only — no POST, no event, no toast, no state mutation. Outcomes per action:

| Action | Behaviour |
|--------|-----------|
| `view_all_phases` | Scrolls/highlights the phase queue pane (left pane) via `element.scrollIntoView()`. No-op if the queue is already visible. |
| `view_summary` | No-op in Phase 2. The action `label` renders verbatim in the Navigation section. Clicking does nothing. Deferred to Phase 4 (artifact renderers) and Phase 7 (summary screen). |
| `view_handoff_notes` | No-op in Phase 2. The action `label` renders verbatim. Clicking does nothing. Deferred to Phase 4. |
| `ask_for_summary` | Renders in the **Execution** section (not Navigation — `action_type: "adapter"` in `actions.json`). POSTs to backend, returns `adapter_not_available`, displays backend `message` verbatim in a toast. |

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phase queue data source | Separate `GET /api/v1/phase-queue` endpoint | Cleaner API surface than embedding in state response |
| Artifact file serving | Controlled endpoint with allowlist | Blocks non-displayable files (`current-state.json`, run records); path-probing resistant |
| Pane orientation | Left=queue, Center=artifact, Right=commands | Most natural reading order |
| State label mapping | Added to API response from `PRODUCT_LABELS` | Zero duplication, zero drift between frontend and backend |
| Initial project creation | Special case in `post_action` handler | Single path for all project creation; no out-of-band bootstrap needed |
| Settings screen | None in Phase 2 | Dark mode toggle in header is sufficient; repo path and mode selection need Phase 3+ |

## Second-Review Fixes (Post-Implementation Review)

A second review pass identified 3 additional gaps. All were fixed:

| # | Issue | Fix |
|---|-------|-----|
| 8 | `GET /api/v1/state` fallback for `project_state_label`/`current_phase_state_label` passed raw snake_case (e.g. `"scope_ready"`) instead of title-cased safe label (`"Scope Ready"`) when state missing from `PRODUCT_LABELS` | Added `_safe_label()` function; both label fields now use title-cased fallback |
| 9 | Backend `GET /actions` label resolution fell through to raw snake_case name when both `ACTION_LABELS` and `actions.json` lacked a label (the frontend `safeLabel()` caught this, but the API contract should return correct labels) | Replaced inline `ACTION_LABELS.get(action_name, entry.get("label", action_name))` with `_resolve_label(action_name, entry)` that applies the full chain: `ACTION_LABELS` → `actions.json` label → title-cased fallback |
| 10 | Same issue in `POST /actions/{action}` response `message` and event log `description` — both used raw label fallback | Both now use `_resolve_label()` |

## Manual Acceptance Test Results

All 9 manual test cases from the sharpened plan were executed against a running backend:

### Artifact Endpoint Denial (B2 allowlist)

| # | Request | Expected | Result |
|---|---------|----------|--------|
| 1 | `GET /api/v1/artifacts/current-state.json` | 404 — not in allowlist | ✅ 404 |
| 2 | `GET /api/v1/artifacts/events.ndjson` | 404 — not JSON | ✅ 404 |
| 3 | `GET /api/v1/artifacts/runs/01J8Z3X.json` | 404 — not in allowlist | ✅ 404 |
| 4 | `GET /api/v1/artifacts/../../etc/passwd.json` | 404 — not in allowlist | ✅ 404 |
| 5 | `GET /api/v1/artifacts/scope.json` | 200 — in allowlist (file exists after project start) | ✅ 200 |
| 6 | `GET /api/v1/artifacts/phase-plan-phase_001.json` | 200 (if exists) or 404 (but NOT 400) — pattern match | ✅ 200 (file created, respond ok) |
| 7 | `GET /api/v1/artifacts/build-summary-phase_01.json` | 404 — `phase_01` doesn't match `phase_\d{3}` (only 2 digits) | ✅ 404 (even when a file with that name exists, proving the pattern rejection is separate from file existence) |

### Missing-Label Safety

| # | Setup | Expected | Result |
|---|-------|----------|--------|
| 1 | Added synthetic action `test_unlabeled_action` to `actions.json` with no `label` field; not in `ACTION_LABELS` | `GET /actions` returns label as title-cased fallback (`"Test Unlabeled Action"`) | ✅ `"Test Unlabeled Action"` |
| 2 | Same action POST'd via `POST /actions/test_unlabeled_action` | Response `message` contains title-cased label, not raw snake_case | ✅ `"Test Unlabeled Action completed."` |

### Bootstrap Atomicity

| # | Setup | Expected | Result |
|---|-------|----------|--------|
| 1 | Deleted `.flowbench/`, called `POST /api/v1/actions/start_new_project` | 200, `current-state.json` created, all `CurrentState` fields present, `updated_at` valid ISO datetime | ✅ `{"status":"ok","new_state":"scope_ready"}`; file has all 9 required fields; `updated_at: "2026-07-11T01:18:32.311480Z"` (valid ISO 8601) |
| 2 | After (1), validate `.flowbench/current-state.json` against `CurrentState` Pydantic schema | All fields pass schema validation | ✅ `schema_version: 1`, `project_state: "scope_ready"`, all fields present |

## Review Findings and Fixes

A post-implementation review identified 7 issues. All were fixed before handoff:

| # | Issue | Fix |
|---|-------|-----|
| 1 | Adapter buttons had `disabled` attribute → `onClick` never fired | Removed `disabled`, kept `opacity-50` for visual gray-out, click now fires `postAction` + toast |
| 2 | Adapter actions didn't re-fetch `/state` and `/actions` after POST | Added `reloadAll()` call in adapter handler |
| 3 | Risk dialog skipped re-fetch on POST error (kept dialog open but didn't invalidate queries) | Moved `onComplete()` outside the success/error branch so error path also re-fetches |
| 4 | Risky action detection checked `risk_category && risk_explanation` (not just `risk_category`) | Changed to single `risk_category` check per plan spec |
| 5 | B4 bootstrap wrote `current-state.json` before scope artifact (crash window if interrupted between writes) | Removed premature write; bootstrap only creates in-memory `state_data`, lets normal flow handle persistence |
| 6 | Unused `Separator` import in `command-pane.tsx` | Removed |
| 7 | Unused `onStartProject` prop in `CommandPaneProps` | Removed |

## Test Coverage

- **Frontend**: `npm run build` passes (compiled + type-checked)
- **Backend**: 143 tests pass, ruff clean
- **Updated test**: `test_error_on_missing_state` → `test_start_new_project_bootstraps_state` (asserts 200 instead of 400, matching B4 behavior)

## API Surface Summary

| Method | Path | Phase |
|--------|------|-------|
| `GET` | `/api/v1/state` | **Modified** — now includes `project_state_label`, `current_phase_state_label` |
| `GET` | `/api/v1/actions` | **Modified** — labels now sourced from `ACTION_LABELS` |
| `POST` | `/api/v1/actions/{action}` | **Modified** — labels from `ACTION_LABELS`; bootstraps state for `start_new_project` |
| `GET` | `/api/v1/phase-queue` | **New** |
| `GET` | `/api/v1/artifacts/{filename}` | **New** — allowlisted artifact files only |

## Deferred Boundaries

| Feature | Phase | Current Status |
|---------|-------|----------------|
| Artifact renderers (formatted cards) | 4 | Raw JSON only |
| Timeline / event log UI | 4 | Event endpoint exists but not consumed |
| Backend `confirmed` flag enforcement | 3 | Sent `confirmed:true` but Pydantic ignores (Phase 2 silent) |
| Policy engine `get_risk_explanation()` | 5 | Risk data from `actions.json` is sufficient |
| Dialog keyboard shortcuts, ARIA, focus trap | 5 | Click-only approval/rejection; no keyboard accessibility |
| Recovery UI (interrupted runs) | 7 | Not needed until adapter actions run |
| Blocked state explanations | 7 | Phase 2 error messages suffice |
| Settings screen (repo path, mode selection) | 3+ | Meaningless until `load_existing_project` works |
| Drag-and-drop phase reorder | 4+ | Static list only |
| Adapter execution | 3+ | All adapter actions return `adapter_not_available` |
