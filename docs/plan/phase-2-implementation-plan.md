# Phase 2 — Console UI: Shell, Navigation, and Base Layout

**Status**: Plan — final. Ready for build.
**Commit**: `ea2e8af`

## Goal

Build the console shell UI for FlowBench — a three-pane layout with header, stage-aware command pane, risk confirmation dialog, placeholder artifact area, basic phase queue, and dark mode toggle. The UI consumes the Phase 1 API endpoints plus two lightweight artifact-serving endpoints added in B1/B2.

## Non-Goals (Explicitly Out of Scope)

- **No artifact rendering** — artifact panel shows raw JSON or `"No artifact yet"`. All formatted artifact renderers are Phase 4.
- **No timeline** — event log display deferred to Phase 4. The `GET /api/v1/events` endpoint exists but is not consumed by this UI.
- **No backend enforcement of `confirmed` flag** — the risk dialog sends `confirmed: true` on approve, but Phase 1 backend ignores it. Backend enforcement is Phase 3.
- **No adapter execution** — all adapter actions return `adapter_not_available` from backend. UI must display this clearly.
- **No policy engine** — risk explanations come from `actions.json` via the API, not from a shared policy engine (Phase 5).
- **No CLI changes** — the `flowbench` CLI is untouched.
- **No recovery UI** — interrupted-run recovery banner is Phase 7.
- **No blocked state UI** — blocked state explanations are Phase 7.
- **No settings screen** — dark mode toggle lives in the header. No separate settings page until repo path and mode selection are functional (Phase 3+).

## Dependencies

- **Phase 1 is complete** — all 8 API endpoints are live at `http://127.0.0.1:8000`.
- **Node.js 18+** required for Next.js 14.
- **External packages**: `shadcn/ui` (8 components), `@tanstack/react-query` (v5), `next-themes` (dark mode).

## Layout Architecture (Three-Pane)

```
┌──────────────────────────────────────────────────────┐
│ PROJECT HEADER (project name, state label, phase ID) │
├──────────┬──────────────────────────┬─────────────────┤
│ PHASE    │ ARTIFACT PANEL           │ COMMAND PANE    │
│ QUEUE    │ (placeholder: raw JSON   │ (stage-aware     │
│ (list    │  or "No artifact yet")   │  action buttons, │
│  with    │                          │  risk dialog)    │
│  color   │                          │                  │
│  badges) │                          │                  │
└──────────┴──────────────────────────┴─────────────────┘
```

Left pane (220px min): phase queue list with color-coded status badges.
Center pane (flex-1): artifact panel showing raw JSON or empty state.
Right pane (280px min): command pane with action buttons grouped by type.

## Implementation Tasks

### 2.1 — Next.js + shadcn/ui + TanStack Query base layout

**Files:**
- `apps/web/package.json` — add dependencies
- `apps/web/tailwind.config.ts` — add dark mode class-based strategy, shadcn/ui config
- `apps/web/src/app/globals.css` — add shadcn/ui CSS variables (light + dark)
- `apps/web/src/app/layout.tsx` — wrap with Providers (ThemeProvider, QueryClientProvider)
- `apps/web/src/components/providers.tsx` — ThemeProvider + QueryClientProvider composition
- `apps/web/src/lib/utils.ts` — `cn()` utility from shadcn/ui pattern
- `apps/web/components.json` — shadcn/ui project config

**Details:**

1. Add to `package.json` dependencies:
   - `@tanstack/react-query` ^5.x
   - `next-themes` ^0.3.x
   - `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (shadcn/ui deps)
   - `tailwindcss-animate` (shadcn/ui animation plugin)

2. Run `npx shadcn@latest init` to scaffold `components.json`, then add exactly these 8 components (via `npx shadcn@latest add button card badge scroll-area separator skeleton toast dialog`):
   - `Button` — action buttons in command pane
   - `Card` — artifact panel
   - `Badge` — phase queue status badges
   - `ScrollArea` — phase queue scroll, command pane scroll
   - `Separator` — visual dividers
   - `Skeleton` — loading states for polling
   - `Toast` — action feedback notifications
   - `Dialog` — risk confirmation dialog

3. `layout.tsx` structure:
   ```tsx
   <html lang="en" suppressHydrationWarning>
     <body>
       <Providers>
         <div className="min-h-screen bg-background">
           {children}
         </div>
       </Providers>
     </body>
   </html>
   ```

4. `providers.tsx`: wraps children in `<ThemeProvider>` + `<QueryClientProvider>` + `<Toaster />`. Uses `next-themes` `attribute="class"` strategy for Tailwind dark mode. `<Toaster />` lives inside `<Providers>` so toast notifications persist across any UI state changes.

5. `tailwind.config.ts`: add `darkMode: "class"`, shadcn/ui theme tokens, `tailwindcss-animate` plugin, and `content` paths for `./src/**/*.{ts,tsx}`.

**Acceptance:** App starts with `npm run dev` without errors. Three-pane layout renders. Dark mode toggles via class.

---

### 2.2 — API client

**File:** `apps/web/src/lib/api.ts`

**Details:**

Single module exporting typed fetch wrappers for the 3 consumed endpoints:

```typescript
const BASE = "http://127.0.0.1:8000/api/v1";

export async function fetchState(): Promise<StateResponse> { ... }
export async function fetchActions(): Promise<ActionEntry[]> { ... }
export async function postAction(action: string, body?: ActionRequestBody): Promise<ActionResponse> { ... }
```

Also export shared types matching the API response shapes:
- `StateResponse` — `CurrentState` (includes `project_state_label`, `current_phase_state_label` via B3) + potential `no_project` status
- `ActionEntry` — `{ action, label, description, risk_category, risk_explanation, action_type, enabled }`
- `ActionRequestBody` — `{ scope_content?, confirmed? }`
- `ActionResponse` — `{ status, new_state?, message, state_unchanged? }`

**Label sourcing rule (single-sourced, contract-driven):** All user-facing labels must come from backend fields, not from frontend recalculation:
- **State labels** (`project_state_label`, `current_phase_state_label`): sourced from `PRODUCT_LABELS` in `engine/state_machine.py` via B3.
- **Action labels** (`label` on each `ActionEntry`): sourced from `ACTION_LABELS` in `engine/state_machine.py` via B6.
- **Risk explanations** (`risk_explanation`): sourced from `actions.json` via existing API.
- The frontend renders these fields **verbatim when present and non-empty**. No mapping, translation, or fallback to raw internal names. The "verbatim" rule and the "safe fallback" rule below describe a single priority chain: backend label → safe fallback → never raw internal name.

**Missing-label safety rule:** If a label field is `None` or empty from both `ACTION_LABELS` and `actions.json`, the UI must **never** display the raw internal action name (e.g., `"generate_master_plan"`). Instead, display a safe fallback: replace underscores with spaces and title-case the result (e.g., `"Generate Master Plan"`). This is a defense-in-depth fallback — in normal operation B3/B6 guarantee labels are always present, so this path should never be reached.

**Adapter response rule:** When `postAction` returns `status: "adapter_not_available"`, the UI must display the backend's `message` field verbatim. No freeform or hardcoded adapter note.

**Error/state refresh rule:** After every `postAction` call, the UI unconditionally re-fetches both `GET /api/v1/state` and `GET /api/v1/actions`, regardless of the HTTP status code. The UI relies on these responses to determine the new state — it never assumes state changed based on the POST response alone.

**Acceptance:** All three API functions callable. Error responses handled without throwing raw HTTP errors. Labels rendered from backend fields only. State/actions re-fetched after every POST.

---

### 2.3 — Project header with adaptive polling

**Files:**
- `apps/web/src/hooks/use-project-state.ts`
- `apps/web/src/components/project-header.tsx`

**Details:**

**`use-project-state.ts`:**
- Calls `fetchState()` using `@tanstack/react-query` with dynamic `refetchInterval`
- Adaptive polling uses `updated_at` field from response: if unchanged from previous poll → 5s interval; if changed → 2s interval
- Stores last known `updated_at` value in a ref for comparison
- Returns `{ data, isLoading, isError, isNoProject }` where `isNoProject` is `data?.status === "no_project"`

**`project-header.tsx`:**
- Displays (left to right): project display name, state label (from `project_state_label` / `current_phase_state_label` in API response, see B3), phase ID if any, total phases / phases complete
- Right-aligned: dark mode toggle button (sun/moon icon using `next-themes` `useTheme`)
- If no project: shows "No project" with "Start new project" call-to-action button that focuses the command pane
- Shows skeleton during loading
- Fixed at top of page, full width, with `sticky top-0 z-10`

**Acceptance:** All header fields render. Polling switches between 2s and 5s based on `updated_at`. No project state shows CTA. Dark mode toggle works.

---

### 2.4 — Stage-aware command pane with risk confirmation dialog

**Files:**
- `apps/web/src/hooks/use-actions.ts`
- `apps/web/src/components/command-pane.tsx`
- `apps/web/src/components/risk-confirmation-dialog.tsx`

**Details:**

**`use-actions.ts`:**
- Calls `fetchActions()` on mount and after every action POST (invalidate query triggers refetch)
- Groups actions by `action_type` (system, navigation, adapter)
- Returns `{ data, isLoading, refetch }`

**`command-pane.tsx`:**
- Scrollable right pane (280px+)
- Section header: "Actions"
- **No-project state**: when `isNoProject` is true, the command pane renders a single "Start new project" card with a multi-line textarea for scope description and a "Create" button. On click, POSTs to `start_new_project` with `{ scope_content }`. After POST (regardless of HTTP status), re-fetches `/state` and `/actions`. On success, the state transitions to `scope_ready` and the full pane renders. This bypasses the actions endpoint since no actions are available without a project.
- When a project exists, groups buttons visually by type with section labels:
  - "Project actions" (system actions with no risk)
  - "Risky actions" (system actions with `risk_category` set)
  - "Navigation" (navigation actions)
  - "Execution" (adapter actions — grayed out, click shows toast with backend `message` field verbatim)
- Each button shows the action `label` (not internal name)
- Click on a non-risky system action → dispatches POST immediately → then unconditionally re-fetches `/state` and `/actions`
- Click on a risky system action → opens `risk-confirmation-dialog`
- **Navigation action dispatch (exact client-side outcomes):** Every navigation action is client-side only — no POST, no event, no toast. Outcomes are defined per action:
  - `view_all_phases` → scrolls/highlights the phase queue pane (left pane). If the queue is already visible, this is a no-op.
  - `view_summary`, `view_handoff_notes`, `ask_for_summary` → no-op in Phase 2. Displayed as informational buttons (the action `label` renders verbatim) but clicking does nothing. Deferred to Phase 4 (artifact renderers) and Phase 7 (summary screen).
- Click on adapter → shows toast with the backend's `message` field verbatim. No freeform text, no hardcoded fallback.
- After every `postAction` call (success or error), unconditionally invalidate both `use-actions` and `use-project-state` queries to force refetch
- Show skeleton during loading, empty state if no actions available

**`risk-confirmation-dialog.tsx`:**
- Uses shadcn/ui `Dialog` component
- Title: action label
- Body: risk explanation from `actions.json` via API, rendered verbatim
- Two buttons: "Cancel" (reject) and "Proceed" (approve)
- Reject → closes dialog, no side effects
- Approve → calls `postAction(action, { confirmed: true })` → closes dialog → re-fetches `/state` and `/actions` unconditionally
- Loading state while POST is in flight (disable both buttons, show spinner on "Proceed")
- Error state if POST fails (show error message, keep dialog open)
- Note: `confirmed: true` is a sentinel field in Phase 2. The Phase 1 backend silently ignores it (Pydantic v2 drops unknown fields by default — `ActionRequest` only defines `scope_content` and `repo_path`). Backend enforcement of the `confirmed` flag is Phase 3.

**Acceptance:** Only valid actions for current state shown. Labels render from backend fields verbatim. Risk dialog appears for risky actions with correct explanation. Reject closes dialog with no side effects. Approve → POST with `confirmed:true` then re-fetch `/state` and `/actions`. Adapter actions show backend `message` field verbatim. Navigation actions are client-side only (no POST).

---

### 2.5 — Placeholder artifact area and basic phase queue

**Files:**
- `apps/web/src/hooks/use-phase-queue.ts`
- `apps/web/src/components/artifact-panel.tsx`
- `apps/web/src/components/phase-queue.tsx`

**Details:**

**`use-phase-queue.ts`:**
- Fetches phase queue data from `GET /api/v1/phase-queue` (backend endpoint added in B1)
- If state has no project or no queue file exists, returns empty array
- Returns `{ data, isLoading }` where `data` is an array of `PhaseQueueItem`

**`artifact-panel.tsx`:**
- Center pane, flex-1
- **Phase-state precedence rule**: When both `current_phase_state` and `project_state` are present, the phase state takes precedence for artifact selection. This means: if we're inside a phase (any phase state), show the phase-level artifact; otherwise fall through to the project-level artifact for the current project state.
- Derives "current artifact" from current state by applying the precedence rule, then mapping the resulting state name → expected artifact file
- Stage-to-artifact mapping (simple, not the full Phase 4 data-driven version):
  - `scope_ready` → `scope.json`
  - `master_plan_drafting`, `master_plan_sharpening` → `master-plan.json`
  - `phase_queue_ready` → `phase-queue.json`
  - `phase_plan`, `phase_sharpening` → `phase-plan-<phase_id>.json`
  - `phase_building` → `build-summary-<phase_id>.json`
  - etc.
- Fetches the artifact file from the backend (raw JSON) — **add `GET /api/v1/artifacts/{path}` endpoint** or use `FileStore` to serve by name
- Simpler approach: **add `GET /api/v1/artifacts/{filename}` endpoint** that reads and returns any file from `.flowbench/`. Path-validate to only allow `.json` files.
- Shows raw JSON in a `<pre>` block inside a `Card` with monospace font
- **Safety constraint**: artifact JSON must be HTML-escaped before rendering (per master plan: "Treat all artifact content as untrusted text when rendering — escape HTML"). Use a text-level escape function, never `dangerouslySetInnerHTML`.
- **Read-only**: no editing, no mutation. Artifact display is for reference only. Editable scope is handled through the command pane's `edit_scope` action.
- If no artifact exists for current state: shows `"No artifact yet"` with a suggested action
- If no project: shows `"Start a project to begin."`
- Scrollable content within the pane

**Decision:** Add `GET /api/v1/artifacts/{filename}` to the backend. This is needed because there's no way to serve arbitrary artifact files from the frontend otherwise. The endpoint reads from `.flowbench/`, validates filename is alphanumeric with `.json` extension, and returns contents or 404.

**`phase-queue.tsx`:**
- Left pane (220px min, scrollable)
- Section header: "Phases"
- Fetches phase queue from `GET /api/v1/phase-queue`
- Renders list of phase items, each showing:
  - Phase name (e.g., "Phase 1: Setup")
  - Status badge with color, using only the exact `status` values defined in the workflow contract (`PhaseQueueItem.status` regex: `^(upcoming|in_progress|complete|blocked|skipped)$`):
    - `upcoming` — gray
    - `in_progress` — blue
    - `complete` — green
    - `blocked` — red
    - `skipped` — yellow
- If no project: shows "Start a project to see phases."
- If empty queue: shows "No phases yet."
- Simple list, no drag-and-drop (reorder deferred — reorder is a UI affordance only in V1)

**Acceptance:** Artifact area shows raw JSON or "No artifact yet". Phase list renders with color-coded badges. Both panes scroll independently.

---

### 2.6 — Dark mode toggle

**Details:**

Dark mode is managed entirely through the header component — no separate settings screen or page. Repo path, mode selection, and project-level configuration are deferred until those features are functional (Phase 3+).

- Dark mode toggle is a sun/moon icon button in the header, right-aligned
- Uses `next-themes` `useTheme` hook: `const { setTheme, theme } = useTheme()`
- Click toggles between `"light"` and `"dark"` — Tailwind `dark:` variants handle the rest
- Theme preference persisted by `next-themes` via localStorage (built-in behavior)

**Acceptance:** Dark mode toggles via header button. Preference persists across page reloads.

---

### 2.7 — Main page assembly / routing

**File:** `apps/web/src/app/page.tsx`

**Details:**

Single page app (no routing). Assembled as:

```tsx
<main className="flex flex-col h-screen min-w-[1280px]">
  <ProjectHeader />
  <div className="flex flex-1 overflow-hidden">
    <PhaseQueue className="w-[220px] border-r" />
    <ArtifactPanel className="flex-1" />
    <CommandPane className="w-[280px] border-l" />
  </div>
  <RiskConfirmationDialog />
</main>
```

- `<Toaster />` lives in `providers.tsx` (not page.tsx) so notifications persist across all states
- No router — single page, no navigation
- Assumes minimum 1280px viewport (Phase 1 server is localhost-only, desktop target)

**Acceptance:** Full layout renders with all three panes and header. Dark mode works.

---

## Backend Additions (Minimal — Required for Phase 2 to Work)

These are small additions, not full sub-tasks:

### B1 — `GET /api/v1/phase-queue`

**File:** `services/orchestrator/api/state.py`

New endpoint:
```python
@router.get("/phase-queue")
async def get_phase_queue():
    store = FileStore(".")
    data = store.read_json("phase-queue.json")
    if data is None:
        return {"phase_queue": [], "total": 0}
    return {
        "phase_queue": data if isinstance(data, list) else data.get("phases", data),
        "total": len(data) if isinstance(data, list) else len(data.get("phases", [])),
    }
```

Returns phase queue items or empty list. No side effects.

### B2 — `GET /api/v1/artifacts/{filename}` with allowlist

**File:** `services/orchestrator/api/state.py` (or new `api/artifacts.py`)

**Security model:** The endpoint uses an **explicit allowlist** of displayable artifact filenames. Only files matching the Phase 1 & 2 artifact layout are served. Non-displayable files (e.g., `current-state.json`, `runs/*.json`, `events.ndjson`) are denied. This prevents accidental data exposure through the artifact panel.

**All denied requests return 404** — both non-allowlisted filenames and non-existent files. A single error code avoids leaking information about which files exist but are not displayable (path-probing resistance).

Allowlist:
- Fixed filenames: `scope.json`, `master-plan.json`, `sharpening-notes.json`, `phase-queue.json`, `audit.json`
- Phase-specific pattern: `<prefix>-<phase_id>.json` where prefix is one of `phase-plan`, `build-summary`, `review-findings`, `test-results`, `handoff`, `decision` and `<phase_id>` matches `^phase_\d{3}$`

New endpoint:
```python
ALLOWED_ARTIFACTS = {
    "scope.json", "master-plan.json", "sharpening-notes.json",
    "phase-queue.json", "audit.json",
}

@router.get("/artifacts/{filename}")
async def get_artifact(filename: str):
    import re
    if filename in ALLOWED_ARTIFACTS:
        pass  # fast path
    elif re.match(r"^(phase-plan|build-summary|review-findings|test-results|handoff|decision)-phase_\d{3}\.json$", filename):
        pass
    else:
        return JSONResponse(status_code=404, content={"error": "Artifact not found"})
    store = FileStore(".")
    data = store.read_json(filename)
    if data is None:
        return JSONResponse(status_code=404, content={"error": "Artifact not found"})
    return data
```

- **Safety note**: the allowlist is the primary access control. `FileStore._validate_path()` is a secondary layer that ensures the resolved path stays under `.flowbench/`. Both layers are applied.

### B3 — State API returns labels

**File:** `services/orchestrator/api/state.py`

Modify the `get_state` endpoint to include `project_state_label` and `current_phase_state_label` fields derived from `PRODUCT_LABELS` in `engine/state_machine.py`:

```python
from services.orchestrator.engine.state_machine import PRODUCT_LABELS

@router.get("/state")
async def get_state():
    store = FileStore(".")
    data = store.read_json("current-state.json")
    if data is None:
        return {"status": "no_project", "message": "No project is set up yet."}
    data["project_state_label"] = PRODUCT_LABELS.get(data.get("project_state"), data.get("project_state"))
    if data.get("current_phase_state"):
        data["current_phase_state_label"] = PRODUCT_LABELS.get(data["current_phase_state"], data["current_phase_state"])
    return data
```

This eliminates frontend/backend label duplication. The frontend never hardcodes state labels.

### B4 — Handle initial project creation

**File:** `services/orchestrator/api/actions.py`

**Problem:** In Phase 1, `start_new_project` requires `current-state.json` to exist (returns 400 `NO_PROJECT` if missing). But a fresh install has no state file — the user is in a chicken-and-egg problem.

**Fix:** In the system action handler, before the NO_PROJECT check, add a special case: if the action is `start_new_project` and the state file doesn't exist, create an initial state with `project_state: "starting"` and proceed with the transition.

```python
# Before the NO_PROJECT check (line 136)
if action == "start_new_project":
    if state_data is None:
        from datetime import datetime, timezone
        from services.orchestrator.schemas.state import CurrentState
        state_data = CurrentState(
            project_display_name="My Project",
            repo_path=str(Path.cwd()),
            mode="new_build",
            project_state="starting",
            total_phases=0,
            phases_complete=0,
            adapter="opencode",
            updated_at=datetime.now(timezone.utc),
        ).model_dump()
        # Continue with normal transition logic
```

This is the minimal bootstrap — the state file is created, then the transition engine immediately moves to `scope_ready`.

### B5 — Register new routers in `main.py`

Add `phase-queue` and `artifacts` routers to the app. No router change needed for B3 (it modifies an existing endpoint), B4 (it modifies existing action logic), or B6 (it uses existing endpoint).

### B6 — Action labels from `ACTION_LABELS`

**File:** `services/orchestrator/api/actions.py`

**Problem:** The `GET /api/v1/actions` and `POST /api/v1/actions/{action}` endpoints currently get action labels from `actions.json`'s `label` field. The labeling source of truth is `ACTION_LABELS` in `engine/state_machine.py`.

**Fix:** In both endpoints, after loading the action entry from `actions.json`, override the `label` with the value from `ACTION_LABELS` if it exists:

```python
from services.orchestrator.engine.state_machine import ACTION_LABELS

# In get_actions, after creating each action entry:
label = ACTION_LABELS.get(action_name, entry.get("label", action_name))

# In post_action, for building the response message:
label = ACTION_LABELS.get(action, action_entry.get("label", action))
```

This keeps action labels single-sourced from `ACTION_LABELS` (same as `PRODUCT_LABELS` for state labels in B3). `actions.json` remains the source for `description`, `risk_category`, `risk_explanation`, and `action_type`.

**Acceptance:** All action labels match `ACTION_LABELS` in `engine/state_machine.py`. No frontend label mapping needed.

---

## Component & File Summary

| Path | Type | Task |
|------|------|------|
| `apps/web/package.json` | Modify | Add deps |
| `apps/web/tailwind.config.ts` | Modify | shadcn/ui + dark mode |
| `apps/web/components.json` | Create | shadcn/ui config |
| `apps/web/src/app/globals.css` | Modify | shadcn/ui CSS vars |
| `apps/web/src/app/layout.tsx` | Modify | Providers wrapper |
| `apps/web/src/app/page.tsx` | Modify | Main three-pane layout |
| `apps/web/src/components/providers.tsx` | Create | Theme + Query + Toaster providers |
| `apps/web/src/lib/utils.ts` | Create | `cn()` utility |
| `apps/web/src/lib/api.ts` | Create | API client (state, actions, postAction) |
| `apps/web/src/hooks/use-project-state.ts` | Create | Adaptive polling hook |
| `apps/web/src/hooks/use-actions.ts` | Create | Actions fetch hook |
| `apps/web/src/hooks/use-phase-queue.ts` | Create | Phase queue hook |
| `apps/web/src/components/project-header.tsx` | Create | Header + dark mode toggle |
| `apps/web/src/components/command-pane.tsx` | Create | Action buttons pane + scope input |
| `apps/web/src/components/risk-confirmation-dialog.tsx` | Create | Risk dialog |
| `apps/web/src/components/artifact-panel.tsx` | Create | Artifact display |
| `apps/web/src/components/phase-queue.tsx` | Create | Phase queue list |
| `services/orchestrator/api/state.py` | Modify | Add B1 (phase-queue), B2 (artifacts), B3 (state labels) |
| `services/orchestrator/api/actions.py` | Modify | Add B4 (initial project creation), B6 (ACTION_LABELS labels) |
| `services/orchestrator/main.py` | Modify | Register new routers |

## UI Behavior Matrix

| User Action | System Action (no risk) | System Action (risky) | Navigation Action | Adapter Action |
|---|---|---|---|
| Click button | POST immediately, then re-fetch `/state` and `/actions` unconditionally | Open risk dialog → POST on approve, then re-fetch unconditionally | Client-side only (highlight pane, no POST) | Show toast with backend `message` verbatim |
| Dialog appears | N/A | Yes, with risk explanation | N/A | N/A |
| Reject in dialog | N/A | Close dialog, no-op | N/A | N/A |
| Approve in dialog | N/A | POST with `confirmed:true`, then re-fetch unconditionally | N/A | N/A |
| POST fails | Show error toast + re-fetch `/state` and `/actions` | Show error toast + re-fetch `/state` and `/actions` | N/A | N/A |
| State changes | Detected by re-fetched responses, not assumed locally | Detected by re-fetched responses, not assumed locally | N/A | N/A |

## Acceptance Checks

1. `npm run dev` starts without errors on the frontend
2. Three-pane layout renders on `http://localhost:3000`
3. Header shows project info (name, state label, phase ID, phase count) when a project exists; shows "No project" CTA when none
4. Header polling uses `updated_at` comparison: 2s after changes, 5s when idle
5. No-project state shows scope textarea + "Create" button in command pane
6. Command pane shows only valid actions for current state, grouped by type
7. Risky actions open confirmation dialog with correct risk explanation
8. Approving in dialog POSTs action then re-fetches `/state` and `/actions`; rejecting does nothing
9. Navigation actions are client-side only (no POST, no toast)
10. Adapter actions show backend `message` field verbatim (no freeform text)
11. Phase queue renders list with color-coded status badges
12. Artifact panel shows raw JSON for current artifact or "No artifact yet"
13. Artifact selection follows phase-state precedence: when `current_phase_state` is set, the phase-level artifact is shown; otherwise the project-level artifact for `project_state` is shown
14. Artifact JSON is HTML-escaped and read-only (no `dangerouslySetInnerHTML`, no editing)
15. Dark mode toggle in header works and persists across reload
16. Backend `/api/v1/phase-queue` and `/api/v1/artifacts/{filename}` return correct data
17. State API returns `project_state_label` and `current_phase_state_label` from `PRODUCT_LABELS`
18. Action labels in API response match `ACTION_LABELS` (not frontend-recalculated)
19. `start_new_project` works from truly fresh state (no `current-state.json`), produces a file matching `services/orchestrator/schemas/state.py:CurrentState` (`schema_version`, all required Pydantic fields present, `updated_at` is valid ISO datetime) written atomically (no partial writes survive a simulated crash before os.rename)
20. Loading states (skeleton) show during data fetch
21. Error states handled gracefully (no blank white page, no raw JSON errors visible to user)

## Phase 2 Acceptance Criteria vs Workflow-Contract Golden-Path Tests

The master plan defines 6 golden-path acceptance tests. Phase 2 is directly verified against these two:

### "Adapter unavailable in Phase 1" test

**Test description:** Adapter-backed action → `adapter_not_available` response → state unchanged.

**Phase 2 verification:** The command pane renders adapter actions grayed out. Clicking one displays the backend's `message` field verbatim in a toast. No state change occurs (backend guarantees this). UI does not create a RunRecord (backend guarantees this).

### "Invalid transition" test

**Test description:** Invalid action for current state → 400 with explanation → state unchanged.

**Phase 2 verification:** The command pane should not show actions that are invalid for the current state (it derives valid actions from `GET /api/v1/actions`). If an invalid action somehow reaches the backend via direct API call (not through the UI), the UI handles the 400 response inline — shows an error toast with the backend's `message` field, re-fetches `/state` and `/actions` (per the error/state refresh rule), and the header polling confirms no state change. No page navigation, no error page template.

### Non-covered tests (out of scope for Phase 2)

| Test | Phase | Reason |
|------|-------|--------|
| New build golden path | 3+ | Requires adapter execution |
| Existing app golden path | 6 | Requires `load_existing_project` |
| Interrupted run recovery | 7 | Requires RunRecord lifecycle in UI |
| Approval gate | 5 | Requires backend `confirmed` enforcement |

## Manual Test Cases

These tests must be run manually against the Phase 1 API before declaring Phase 2 complete.

### Artifact endpoint denial (B2 allowlist)

| # | Request | Expected |
|---|---------|----------|
| 1 | `GET /api/v1/artifacts/current-state.json` | 404 — not in allowlist |
| 2 | `GET /api/v1/artifacts/events.ndjson` | 404 — not JSON |
| 3 | `GET /api/v1/artifacts/runs/01J8Z3X.json` | 404 — not in allowlist |
| 4 | `GET /api/v1/artifacts/../../etc/passwd.json` | 404 — not in allowlist |
| 5 | `GET /api/v1/artifacts/scope.json` | 200 — in allowlist |
| 6 | `GET /api/v1/artifacts/phase-plan-phase_001.json` | 200 (if exists) or 404 (but NOT 400) — pattern match |
| 7 | `GET /api/v1/artifacts/build-summary-phase_01.json` | 404 — `phase_01` doesn't match `phase_\d{3}` (only 2 digits) |

### Missing-label safety

| # | Setup | Expected |
|---|-------|----------|
| 1 | Add a synthetic action to `actions.json` with no `label` field and not in `ACTION_LABELS` | UI displays titlecased fallback (e.g., `"my_custom_action"` → `"My Custom Action"`) |
| 2 | Same action's button in command pane shows the fallback label, never the raw snake_case name |

### Bootstrap atomicity

| # | Setup | Expected |
|---|-------|----------|
| 1 | Delete `.flowbench/`, call `POST /api/v1/actions/start_new_project` | 200, `current-state.json` created with all `CurrentState` fields present, `updated_at` is valid ISO datetime |
| 2 | After (1), read `.flowbench/current-state.json` and validate against `CurrentState` Pydantic schema | All fields pass schema validation |

## Builder Decisions Required

1. **Phase queue data source**: Add `GET /api/v1/phase-queue` backend endpoint (recommended) vs. embedding phase queue in state response.
   - **Recommendation**: Separate endpoint. Cleaner API surface. Implemented as B1.

2. **Artifact file serving**: Add `GET /api/v1/artifacts/{filename}` backend endpoint (recommended) vs. exposing `.flowbench/` as static dir.
   - **Recommendation**: Controlled endpoint with explicit filename allowlist + `_validate_path` double guard. Blocks non-displayable files (e.g., `current-state.json`, run records). Implemented as B2.

3. **Three-pane layout orientation**: Left (phase queue) / Center (artifact panel) / Right (command pane) vs. Left (command pane) / Main (artifact panel + queue).
   - **Recommendation**: Left=queue, Center=artifact, Right=commands. Most natural reading order.

4. **State label mapping**: Add `project_state_label` and `current_phase_state_label` to `GET /api/v1/state` vs. hardcoding on frontend.
   - **Recommendation**: Add both fields to the API response (B3). Backend reads from `PRODUCT_LABELS` in `engine/state_machine.py` — zero duplication, zero drift. Frontend renders `state_label` directly.

5. **Initial project creation**: Handle no-state case in `start_new_project` vs. requiring out-of-band bootstrap.
   - **Recommendation**: Add special case in `actions.py` (B4). Creates initial state with `project_state: "starting"` then immediately transitions to `scope_ready`. Single path for all project creation.

6. **Settings screen**: Separate settings page vs. no settings screen in Phase 2.
   - **Recommendation**: No settings screen. Dark mode toggle lives in the header. Repo path and mode selection are meaningless until `load_existing_project` works (Phase 3+).

## Artifact Discovery (Stage-to-Artifact Mapping)

Frontend determines which artifact to display based on current state:

| State | Artifact Filename |
|-------|------------------|
| `scope_ready` | `scope.json` |
| `master_plan_drafting`, `master_plan_sharpening` | `master-plan.json` |
| `phase_queue_ready` | `phase-queue.json` |
| `phase_plan`, `phase_sharpening` | `phase-plan-{phase_id}.json` |
| `phase_ready_to_build`, `phase_building` | `build-summary-{phase_id}.json` |
| `phase_reviewing` | `review-findings-{phase_id}.json` |
| `phase_testing`, `phase_fixing` | `test-results-{phase_id}.json` |
| `phase_handoff`, `phase_complete` | `handoff-{phase_id}.json` |
| All else | null (show empty state) |

This is the simple Phase 2 mapping. Phase 4 replaces this with a data-driven version.

## Deferred to Future Phases

| Feature | Phase | Reason |
|---------|-------|--------|
| Artifact renderers (formatted cards) | 4 | Phase 2 shows raw JSON only |
| Timeline / event log UI | 4 | Not a shell concern |
| Backend `confirmed` flag enforcement | 3 | Phase 1 returns `adapter_not_available` |
| Policy engine `get_risk_explanation()` | 5 | Risk data from `actions.json` is sufficient |
| Dialog keyboard shortcuts (Enter approve, Escape reject), ARIA labels, focus trap | 5 | Phase 2 dialog is functional (click to approve/reject) but not keyboard-accessible or ARIA-compliant yet |
| Recovery UI (interrupted runs) | 7 | Not needed until adapter actions run |
| Blocked state explanations | 7 | Phase 2 error messages suffice |
| Settings screen (repo path, mode selection) | 3+ | Meaningless until `load_existing_project` works |
| Drag-and-drop phase reorder | 4+ | V1 reorder is a UI affordance |

## Estimated Effort

- **Frontend components**: 7 new components, 3 hooks, 2 lib files — ~550-750 lines total
- **Backend additions**: 2 new endpoints + 2 existing endpoint modifications, ~60 lines total
- **Config/setup**: package.json, tailwind, globals.css, shadcn/ui init — ~50 lines changed
- **Tests**: Manual verification against running backend (no frontend test framework set up yet)
- **Total**: ~650-850 lines across ~18 files

## Next Action After This Plan

Review and accept this plan. Then execute sub-tasks in this order:

1. **2.1** — Base setup (dependencies, shadcn/ui, providers, Tailwind)
2. **B1/B2/B3/B4/B5/B6** — Backend additions (parallel with 2.2/2.3 since they're independent workstreams)
3. **2.2** — API client (parallel with backend and 2.3)
4. **2.3** — Header + polling (parallel with backend and 2.2)
5. **2.4** — Command pane + risk dialog
6. **2.5** — Artifact panel + phase queue
7. **2.6** — Dark mode toggle (already handled in 2.3 — no separate step)
8. **2.7** — Page assembly
