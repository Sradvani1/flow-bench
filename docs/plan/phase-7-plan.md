# Phase 7 — Polish and Defaults: CLI, Recovery UI, Safety, and Documentation

> Builds from: ../master-plan.json (phase_007), ../workflow-contract.json, ../master-plan.md
> Depends on: Prior phases 1–6 complete.
>
> **Phase 7 scope:** CLI, recovery UI, blocked state UI, settings screen, navigation action wiring,
> golden path acceptance tests, smoke test, README update, contribution guide.

---

## Current State Audit

| Area | Status |
|---|---|
| `flowbench start` | Works (uvicorn on 127.0.0.1:8000) |
| `flowbench status` | Stub — prints `"Status: not yet implemented"` |
| Recovery UI (interrupted runs) | Backend detects (lifespan handler), frontend never surfaces |
| Blocked state UI | Generic `EmptyStateCard` — functional but no recovery actions |
| Settings screen | Never built; mode selection lives inline in command-pane |
| Structured errors | `ErrorResponse` everywhere |
| Safety constraints | 127.0.0.1 binding, path validation, React auto-escapes |
| Golden path tests | No end-to-end lifecycle test |
| `view_handoff_notes` / `view_summary` | Appear as buttons but no-op on click |
| README / AGENTS.md | Exist (README is stale — says Phase 1/2) |
| CONTRIBUTING.md | Missing |
| Smoke test / install script | Missing |
| Frontend test infrastructure | Jest + testing-library set up (16 dialog tests pass) |

---

## 7.1 — CLI: managed dual-service startup + `status` command

**File**: `services/orchestrator/cli.py` (modified)

### `flowbench start` — managed dual-service startup

Replace the bare uvicorn call with a managed process launcher that starts both the backend API server and the frontend dev server as child processes, waits for both to become reachable, reports startup clearly, and ensures cleanup on all exit paths.

**Behavior**:

1. **Backend** — Starts `uvicorn` on `127.0.0.1:8000` via `uv run` as a subprocess. Polls `http://127.0.0.1:8000/health` up to 15 seconds (1s intervals). On success, prints `Backend ready on http://127.0.0.1:8000`. On timeout, prints `ERROR: Backend failed to start` with the last 10 lines of stderr and exits code 1.

2. **Frontend** — Starts `pnpm run dev` in `apps/web/` as a subprocess. Polls `http://localhost:3000` up to 30 seconds (2s intervals). On success, prints `Frontend ready on http://localhost:3000`. On timeout, prints `ERROR: Frontend failed to start` with the last 10 lines of stderr and exits code 1. The frontend process is spawned only if the backend started successfully.

3. **Cleanup** — Installs `SIGINT`, `SIGTERM`, and `EXIT` handlers that send `SIGTERM` to both child process groups, wait for them to terminate (5s timeout per process), then issue `SIGKILL` if still alive. No zombie children.

4. **Output** — Backend and frontend stdout/stderr are forwarded to the terminal with `[backend]` and `[frontend]` prefixes. The CLI blocks until either child exits (the user presses Ctrl+C to stop both).

**File structure additions** — new private helpers in `cli.py`:

```python
def _start_backend() -> subprocess.Popen: ...
def _start_frontend() -> subprocess.Popen: ...
def _wait_for_url(url: str, timeout: float, interval: float) -> bool: ...
def _cleanup(*processes: subprocess.Popen) -> None: ...
```

> **Design decision**: Using `subprocess.Popen` with process groups (`start_new_session=True`) so the cleanup handler can kill the entire tree. The health endpoint polling replaces the previous static `sleep 2` with exponential readiness detection. Backend-first ordering ensures the frontend never tries to connect before the API is ready.

### `flowbench status`

Replace the `"Status: not yet implemented"` stub with real logic that uses `FileStore` to read `current-state.json` and prints:

```
Project: My Project
Mode: New Build
State: Scope Ready
Phase: —
Phases: 0 of 0 complete
Updated: 2026-07-11T01:18:32Z
```

If no project exists, print `"No project set up yet. Run 'flowbench start' then create a project from the UI."`

### Lifecycle tests — `services/orchestrator/tests/test_cli.py` (6 tests)

New test file for the CLI's `flowbench start` subprocess management:

1. **Backend starts and is reachable** — Run `flowbench start` in background, poll `/health`, verify 200 response before timeout.
2. **Frontend starts and is reachable** — Verify `http://localhost:3000` responds (frontend dev server).
3. **Frontend not started when backend fails** — Mock a backend start failure (e.g., invalid port), verify the frontend subprocess is never spawned.
4. **Cleanup on SIGINT** — Start both services, send SIGINT, verify both processes are gone after `cleanup()`.
5. **Cleanup on SIGTERM** — Same as above with SIGTERM.
6. **Cleanup on process crash** — Kill the backend process externally, verify the frontend is also cleaned up and no zombies remain.

**Acceptance**: `python -m pytest tests/test_cli.py -v` passes with 6 tests. Manual `flowbench start` starts both services, `http://localhost:3000` loads, Ctrl+C stops both cleanly.

---

## 7.2 — Recovery UI: interrupted-run banner (contract recovery choices)

**New files**:
- `apps/web/src/hooks/use-active-run.ts` — hooks into `GET /api/v1/runs/active`
- `apps/web/src/components/recovery-banner.tsx`

**Modified files**:
- `apps/web/src/app/page.tsx` — add `RecoveryBanner` above the three-pane layout
- `apps/web/src/lib/api.ts` — add `RunRecord` type and `fetchActiveRun()`

### `useActiveRun` hook

- Polls `GET /api/v1/runs/active` every 5s
- Returns `{ activeRun, isLoading }`
- Returns null when no active/interrupted run exists

### `RecoveryBanner` component — four contract-mandated recovery choices

Shows only when active run `status === "interrupted"`. Does NOT show for `"running"` (running means the action is currently dispatching — no interference needed).

**Banner**: amber background, "An action was interrupted" heading, plus four action buttons matching the contract's `recovery_choices` exactly:

| Contract choice | Button label | Behavior |
|---|---|---|
| `inspect_current_state` | **Inspect current state** | Read-only. Opens the artifact panel / event log so the builder can inspect the last known state. No API call, no state change. |
| `retry_last_action` | **Retry** | POST `retry` to backend. Creates a **new** RunRecord with a freshly assembled context bundle (not stale inputs from the interrupted run). If the original action had a `risk_category`, the retry requires renewed approval confirmation — the backend enforces this independently (no stale approval reused). The `command_context_hash` must differ from the interrupted run if the context changed. |
| `continue_from_current_state` | **Continue** | Acknowledge the interrupted run (status remains `interrupted`). No API call. Closes the banner and presents stage-valid next actions from the command pane. **Never auto-advances** — the builder selects the next action manually. |
| `revise_the_plan` | **Revise the plan** | POST `replan_from_here` (project) or `replan_phase` (phase). Returns to the applicable planning/sharpening state without modifying prior artifacts. |

> **Design decision**: The contract says "retry creates a NEW RunRecord — it does not change a terminal record's status." The existing backend `retry` action already implements this (see `action_service.py:130` — finds last terminal run, creates a new RunRecord). Approval is re-checked via the risk category of the original action. The frontend Retry button simply POSTs `retry`; the backend handles fresh context assembly and renewed approval.
>
> "Continue" maps to the contract's `continue_from_current_state`. The banner is dismissed (local suppressed flag), polling continues, and the builder picks the next action from the available actions. No automatic state transition ever occurs.

### Retry endpoint/service contract

The `retry` action (`POST /api/v1/actions/retry`) has the following contract:

| Aspect | Behavior |
|---|---|
| **Route** | `POST /api/v1/actions/retry` |
| **Request body** | `{ "confirmed": boolean }` — required if the original action had a `risk_category` |
| **Precondition** | A terminal run (`failed`, `timed_out`, `interrupted`) must exist for the current workflow level (project or phase) |
| **RunRecord** | Creates a **new** RunRecord with fresh `run_id` (ulid). Never reuses the interrupted/failed record's `run_id`. |
| **Context bundle** | Assembled fresh from current artifacts (scope, plan, latest handoff). `command_context_hash` must differ from the interrupted run if the context changed. |
| **Approval** | Re-checked independently by the backend against the original action's `risk_category`. No stale approval from the interrupted run is reused. |
| **State transition** | The retried action's `target_state` is resolved from its original workflow entry. The intermediate state is written before adapter dispatch. |
| **Ownership** | `action_service.py` owns the retry logic (`dispatch_adapter_action` → `action == "retry"` branch). `run_store.py` owns RunRecord lifecycle (create, start, complete, interrupt). `actions.py` routes the HTTP request.

### `page.tsx` change

```tsx
<main className="flex flex-col h-screen min-w-[1280px]">
  <RecoveryBanner />
  <ProjectHeader />
  ...
</main>
```

### Tests — `apps/web/src/__tests__/recovery-banner.test.tsx` (8 tests)

1. Renders nothing when no active run
2. Shows interrupted banner with inspect button
3. Shows retry button dispatches `postAction("retry")`
4. Shows continue button dismisses banner, no API call
5. Shows revise-the-plan button dispatches `postAction("replan_from_here" | "replan_phase")`
6. Renders nothing when run status is `"running"` (banner is for interrupted only)
7. Inspect state button opens artifact panel view (no API call)
8. Retry button is disabled when no terminal run exists

---

## 7.3 — Blocked State UI: dedicated card

**New file**: `apps/web/src/components/artifacts/blocked-state-card.tsx`

**Modified files**:
- `apps/web/src/components/artifacts/index.ts` — add `BlockedStateCard`
- `apps/web/src/lib/artifact-stage-mapping.ts` — point `project_blocked` and `phase_blocked` to `BlockedStateCard`
- `apps/web/src/components/artifact-panel.tsx` — fix render logic to check `rendererName` instead of `filename === null`

### `BlockedStateCard`

- Uses internal hooks (`useProjectState`, `useEvents`) for data instead of the `data` prop — there is no artifact file to load for blocked states
- Shows state badge (`Project Blocked` / `Phase Blocked`) with destructive variant
- Shows blocked explanation (from state label)
- Lists available recovery actions as buttons: "Retry" (adapter), "Revise Scope" (system), "Cancel Project" (system) — actions fetched from `useActions`
- "What happened" section: shows the **last terminal run's `failure_message`** (from the interrupted or failed RunRecord) with highest precedence. If no failure message exists, falls back to the last event description from the timeline. If no events exist, shows a generic message.

### Artifact panel render logic fix

The existing `artifact-panel.tsx` at line 88 unconditionally renders `EmptyStateCard` when `mapping.filename === null`. Since `project_blocked` and `phase_blocked` have `filename: null`, the new `BlockedStateCard` would never render.

**Fix**: Change the condition to check `rendererName` instead:

```tsx
// Before (line 88):
mapping.filename === null || artifact?.data === null

// After:
mapping.rendererName === "EmptyStateCard" && mapping.filename === null || artifact?.data === null
```

This allows `BlockedStateCard` (or any future non-`EmptyStateCard` renderer) to show even when no artifact file exists.

**Acceptance**: When state is `project_blocked` or `phase_blocked`, the artifact panel renders a dedicated recovery card instead of the generic `EmptyStateCard`.

**Tests**: `apps/web/src/__tests__/blocked-state-card.test.tsx` (6 tests)
1. Renders blocked state badge for `project_blocked`
2. Renders blocked state badge for `phase_blocked`
3. Shows recovery actions from `useActions`
4. Shows last event in "What happened" section
5. Renders nothing when state is not blocked
6. Retry button dispatches postAction

---

## 7.4 — Settings screen

**New file**: `apps/web/src/components/settings-screen.tsx`

**Modified files**:
- `apps/web/src/components/project-header.tsx` — add gear icon button that opens settings
- `apps/web/src/lib/api.ts` — add `fetchHealth()`

### Settings-scope acceptance decision

The Settings screen is intentionally **read-only display** in V1. It shows project info and backend health only. The following are explicitly **not** in Settings scope for V1:

| Out-of-scope for Settings | Owned by |
|---|---|
| New-project mode selection (new_build vs existing_app) | Command pane — the mode toggle appears only when no project exists |
| Repository path selection / repo switching | Not implemented in V1. The CWD at startup is the selected repo. Switching repos = new project. |
| Adapter selection / backend configuration | Deferred — uses the configured default adapter |
| Mid-project mode switching | Undefined by workflow contract — requires scope decision |

**Decision rationale**: The command pane already handles mode selection at project creation time. Adding a mid-project mode switch to Settings would require workflow contract changes that are out of scope for Phase 7. Keeping Settings read-only avoids duplicating stateful controls and keeps Settings safe to open without side effects.

### `SettingsScreen` — dialog/modal opened from header

- **Project info section**: mode label, repo path (read-only, from state)
- **Backend health**: green/red indicator pinging `/health`
- **Version**: from health response
- **Close** button

This is intentionally simple — not a full configuration screen. The mode selector already works in the command pane for no-project state. This gives the user a way to see current configuration.

**Acceptance**: Gear icon in header opens modal showing project info and backend health.

---

## 7.5 — Navigation action wiring: `view_summary` and `view_handoff_notes`

**File**: `apps/web/src/components/command-pane.tsx` (modified)

Add two cases in the navigation handler:

```typescript
if (entry.action === "view_all_phases") {
  const queue = document.querySelector("[data-phase-queue]");
  queue?.scrollIntoView({ behavior: "smooth" });
}
if (entry.action === "view_summary") {
  const timeline = document.querySelector("[data-timeline]");
  timeline?.scrollIntoView({ behavior: "smooth" });
}
if (entry.action === "view_handoff_notes") {
  const panel = document.querySelector("[data-artifact-panel]");
  panel?.scrollIntoView({ behavior: "smooth" });
}
```

Add `data-timeline` and `data-artifact-panel` attributes to the corresponding components:

- `apps/web/src/components/project-timeline.tsx` — add `data-timeline` attribute
- `apps/web/src/components/artifact-panel.tsx` — add `data-artifact-panel` attribute

**Acceptance**: Clicking "View Summary" scrolls the timeline into view. Clicking "View Handoff Notes" scrolls the artifact panel.

---

## 7.6 — Golden path acceptance tests (contract-defined, 6 tests)

**New file**: `services/orchestrator/tests/test_golden_paths.py`

Uses the **real `workflows.json` config** (not the simplified `sample_transitions` fixture), along with the existing `MockAdapter` fixture. All 6 golden path tests defined in `docs/workflow-contract.json` must be implemented.

> **Design decision**: Using real `workflows.json` validates against the live config and catches regressions. Adapter actions use a two-phase pattern internally in `action_service.py`: POST action → intermediate state → MockAdapter succeeds → `action_service` auto-fires completion event (e.g., `draft_complete`) → lands in final state. The test asserts the final state directly — no need to manually fire events. The `MockAdapter` returns `success=True, outcome="succeeded"` which triggers the success event path.

### 1. `test_new_build_golden_path` — full lifecycle (contract § golden_path_tests[0])

```
POST start_new_project (with scope text) → state is scope_ready
POST edit_scope                         → state is scope_ready
POST generate_master_plan (confirmed)   → state is master_plan_sharpening (auto two-phase)
POST sharpen_plan (confirmed)           → state is master_plan_sharpening (iterative)
POST accept_master_plan                 → state is phase_queue_ready, phase-queue.json has phases
POST start_next_phase                   → state is phase_in_progress, phase state is phase_starting
POST generate_phase_plan (confirmed)    → phase state is phase_sharpening (auto two-phase)
POST accept_phase_plan                  → phase state is phase_ready_to_build
Read current-state.json and verify it persists correctly (simulate restart)
POST start_building (confirmed)         → phase state is phase_reviewing (auto two-phase, MockAdapter succeeds)
POST accept_review                      → phase state is phase_testing
POST accept_test_results                → phase state is phase_handoff
POST generate_handoff (confirmed)       → handoff.json created (auto two-phase)
POST accept_handoff                     → phase state is phase_complete, project state is phase_queue_ready
POST start_next_phase                   → project state is phase_queue_ready
POST /api/v1/events/all_phases_complete → project state is project_complete
```

Verifies state, artifacts, events, and RunRecords at each step. The simulated restart verifies that `current-state.json` survives process boundaries.

### 2. `test_existing_app_golden_path` — existing app through one phase (contract § golden_path_tests[1])

```
Create temp directory with known files (e.g., package.json, src/index.ts, tests/)
POST load_existing_project (confirmed) pointing to temp dir → state is scope_ready (auto two-phase: audit_complete event)
Verify audit artifact is created with 5 sections
POST edit_scope (with scope text for a new feature)        → state is scope_ready
POST generate_master_plan (confirmed)                      → state is master_plan_sharpening
Verify audit context appears in the assembled context bundle
POST accept_master_plan                                    → state is phase_queue_ready
Complete one full phase: plan → build → review → test → handoff (all mocked)
Verify handoff artifact references the phase context correctly
Clean up temp directory
```

### 3. `test_interrupted_run_recovery` — detect + recovery prompt (contract § golden_path_tests[2])

```
POST start_new_project          → scope_ready
POST edit_scope                 → scope_ready
Manually create RunRecord with status=running (simulate crash mid-dispatch)
Call RunStore.interrupt_running_runs()
Verify RunRecord status=interrupted
Verify state unchanged (still scope_ready)
Verify GET /api/v1/runs/active returns the interrupted run
```

### 4. `test_approval_gate` — approval blocks risky actions (contract § golden_path_tests[3])

```
Reach phase_ready_to_build state via the setup helpers
POST /actions/start_building WITHOUT confirmed flag (risk_category: modify_files)
Verify response status=needs_approval with risk_explanation
Verify state did NOT change — no adapter call, no RunRecord created
POST /actions/start_building WITH confirmed=true
Verify adapter IS called (check MockAdapter.calls) and state transitions to phase_building → phase_reviewing
```

### 5. `test_invalid_transition_rejected` — clear errors (contract § golden_path_tests[4])

```
Reach scope_ready state
POST /actions/accept_master_plan (invalid from scope_ready — only valid from master_plan_sharpening)
Verify 400 response with:
  - error_code "INVALID_TRANSITION"
  - message with plain English explanation
  - suggested_action field pointing to available actions
Verify state did not change
```

### 6. `test_adapter_action_unavailable_in_phase1` — Phase 1-mode regression (contract § golden_path_tests[5])

> **Design decision**: This is a **regression test** verifying that the Phase 1 guard still exists — when no adapter is configured, adapter-backed actions return `adapter_not_available`. The test temporarily removes the `MockAdapter` (via `set_default_adapter(None)` or equivalent), posts an adapter action, and verifies the Phase 1 response contract. This confirms the guard degrades gracefully even as later phases add adapter support.

```
Reach scope_ready state
Remove the registered adapter (simulate Phase 1 / no-backend mode)
POST /actions/generate_master_plan (adapter-backed, without confirmed since it should not even reach the dispatch stage)
Verify response status=adapter_not_available with plain English explanation
Verify state did NOT change — no RunRecord created, no adapter call
Re-register MockAdapter for subsequent tests
```

**Acceptance**: `python -m pytest tests/test_golden_paths.py -v` passes with 6 tests.

---

## 7.7 — Smoke test script (dual-service reachability + process lifecycle)

**New file**: `scripts/smoke-test.sh`

End-to-end smoke test that exercises the managed `flowbench start` CLI, verifies both services are reachable, runs a basic API workflow, and confirms the frontend build compiles. Uses readiness polling (no static sleeps) and trap-based cleanup.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=== FlowBench Smoke Test ==="

# Cleanup handler — kills both backend and frontend child processes
cleanup() {
  if [ -n "${FLOWBENCH_PID:-}" ]; then
    kill "$FLOWBENCH_PID" 2>/dev/null || true
    wait "$FLOWBENCH_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Verify toolchain
echo "--- Toolchain ---"
python3 --version
uv --version
pnpm --version

# 2. Start both services via managed CLI
echo "--- Starting FlowBench ---"
uv run flowbench start &
FLOWBENCH_PID=$!

# 3. Wait for backend (15s timeout, 1s interval)
echo "Waiting for backend..."
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "Backend ready (attempt $i)"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "ERROR: Backend not reachable after 15 attempts"
    exit 1
  fi
  sleep 1
done

# 4. Verify backend health response
curl -sf http://127.0.0.1:8000/health | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'ok', f'Expected ok, got {d[\"status\"]}'
assert 'version' in d, 'Missing version field'
print(f'  version: {d[\"version\"]}')
"
echo "Backend health: OK"

# 5. Start new project via API
curl -sf -X POST http://127.0.0.1:8000/api/v1/actions/start_new_project \
  -H 'Content-Type: application/json' \
  -d '{"scope_content": "Smoke test project"}' | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert d['status'] == 'ok', f'Expected ok, got {d[\"status\"]}'
"
echo "Project creation: OK"

# 6. Verify frontend is reachable (30s timeout, 2s interval)
echo "Waiting for frontend..."
for i in $(seq 1 15); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo "Frontend ready (attempt $((i * 2))s)"
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "ERROR: Frontend not reachable after 30 seconds"
    exit 1
  fi
  sleep 2
done

# 7. Verify frontend serves HTML
curl -sf http://localhost:3000 | python3 -c "
import sys
html = sys.stdin.read()
assert '<!DOCTYPE html>' in html or '<html' in html, 'Frontend did not return HTML'
print(f'  {len(html)} bytes received')
"
echo "Frontend reachable: OK"

# 8. Frontend production build compiles
cd apps/web && pnpm run build
echo "Frontend build: OK"

echo "=== All smoke tests passed ==="
# trap fires automatically on EXIT to clean up the server
```

**Acceptance**: `bash scripts/smoke-test.sh` exits 0.

---

## 7.8 — README update

**File**: `README.md`

- Remove "Phase 1 / 2" from project status — replace with "Phase 7 — feature complete"
- Update adapter description: "Adapter-backed actions dispatch to OpenCode CLI for execution"
- Add `flowbench status` to quick start
- Add smoke test command
- Update architecture diagram to reflect current state

---

## 7.9 — CONTRIBUTING.md

**New file**: `CONTRIBUTING.md`

Sections:
- Dev setup (uv sync, pnpm install)
- Running tests (pytest, pnpm test, ruff)
- Code conventions (Ruff line-length 100, Pydantic v2, no I/O in engine/)
- PR workflow (branch naming, commit messages)
- Adapter guide reference (how to add a new command template)

---

## 7.10 — Structured-error tests

**New file**: `services/orchestrator/tests/test_error_handling.py`

Validates every error path returns structured `ErrorResponse` with `message`, `suggested_action`, and `error_code`. Tests:

1. **Unknown action** — POST non-existent action → 400, `error_code: "UNKNOWN_ACTION"`
2. **No project** — POST system action before project created → 400, `error_code: "NO_PROJECT"`  
3. **Invalid transition** — POST `accept_master_plan` from `scope_ready` → 400, `error_code: "INVALID_TRANSITION"`
4. **Active run exists** — Start adapter action while another is running → 409, `error_code: "active_run_exists"`
5. **No run to retry** — POST `retry` when no terminal run exists → 400, `error_code: "NO_RUN_TO_RETRY"`
6. **General error handler** — Trigger unhandled exception → 500, `error_code: "INTERNAL_ERROR"`
7. **Artifact not found** — GET non-existent artifact → 404, `error_code` present

Each test verifies the response has the correct HTTP status code and that `message`, `suggested_action`, and `error_code` are non-empty strings.

---

## 7.11 — Safety-enforcement tests

**New file**: `services/orchestrator/tests/test_safety.py`

Validates the safety constraints from the contract. Tests:

1. **No I/O in engine layer** — Verify `services/orchestrator/engine/*.py` has no `import os`, `open(`, `Path(` outside ded
2. **Approval enforcement** — POST `start_building` (modify_files) without confirmation → `needs_approval`, no state change, no RunRecord created
3. **Approval backend authority** — POST `start_building` with confirmed=true → adapter called, state transitions
4. **Single active run** — Start one adapter action, then POST another → 409 `active_run_exists`
5. **Interrupted runs auto-detected on startup** — Simulate crash by writing a `status=running` RunRecord, then call `interrupt_running_runs()` → status becomes `interrupted`
6. **No auto-rerun** — After interrupt, state unchanged, no new RunRecord auto-created
7. **Path validation** — Verify repo paths are validated/normalized (test `repo_path` edge cases in `CurrentState`)
8. **Atomic writes** — Verify `FileStore._atomic_write_json` uses temp file + fsync + rename pattern
9. **Symlink/boundary escape** — Attempt to write an artifact with a path containing `../` or symlinks that escape `.flowbench/`. Verify the write is rejected or safely normalized to `.flowbench/` only.
10. **Secret persistence** — Verify no artifact, event, or RunRecord content persists fields named `password`, `secret`, `token`, `api_key`, or `credential` (case-insensitive) as non-empty values in any schema. Test by writing such values via store and verifying they are filtered, truncated, or rejected.
11. **Raw-HTML-safe rendering** — Verify that artifact content containing HTML tags (`<script>`, `<img onerror=`) is escaped when rendered in the frontend. This is a frontend integration test verifying the `EmptyStateCard` / `ScopeCard` etc. render text content safely (React's auto-escaping suffices — verify no `dangerouslySetInnerHTML` is used without explicit XSS review).
12. **RunRecord template-version and working-directory fields** — Dispatch an adapter action and verify the resulting RunRecord has non-null `template_version`, non-null `working_directory`, and `command_context_hash` matching the assembled context bundle.
13. **Artifact-before-event durability ordering** — Write a large artifact followed by an event. Simulate a crash (OSError/IOError) between the two writes. Verify that if the artifact write fails, the event is NOT persisted. If the artifact write succeeds, the event IS persisted. The event is always written AFTER the artifact — never before or concurrently.

---

## 7.12 — AGENTS.md

**New file**: `AGENTS.md` (project root)

Write the canonical `AGENTS.md` for FlowBench that captures:
- Project purpose: "Local workflow console orchestrating software builds through a structured state machine loop"
- Repo layout: apps/web/, services/orchestrator/, config/, docs/
- Commands: flowbench start, flowbench status, pytest, ruff check, pnpm run dev
- Architecture: state machines, artifact layout, adapter-backed actions, RunRecords, event log
- Key API endpoints: /state, /actions, /events, /runs
- Testing: pytest, pnpm test
- Conventions: Ruff line-length 100, Pydantic v2, no I/O in engine/, atomic file writes

Follow the existing format from similar `AGENTS.md` files in surrounding projects.

---

## 7.13 — Prerequisite verification script (non-mutating, uv/pnpm toolchain)

**New file**: `scripts/prereq-check.sh`

Non-mutating pre-flight check for contributors that verifies the development environment. Only checks — never installs. Uses the configured `uv` and `pnpm` toolchain.

```bash
#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0
check() {
  if "$@" > /dev/null 2>&1; then
    echo "  ✓ $1"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $1"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== FlowBench Prerequisite Check ==="
echo ""
echo "--- Python toolchain ---"
check uv --version
check uv run python3 --version
check uv run python3 -c "import fastapi"
check uv run python3 -c "import pydantic"
check uv run python3 -c "import uvicorn"
check uv run python3 -c "import click"
echo ""
echo "--- Frontend toolchain ---"
check pnpm --version
check pnpm --prefix apps/web install --frozen-lockfile --dry-run 2>/dev/null || check test -d apps/web/node_modules
echo ""
echo "Passed: $PASS  Failed: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "Missing dependencies. Install them:"
  echo "  curl -LsSf https://astral.sh/uv/install.sh | sh    # Install uv"
  echo "  corepack enable && corepack prepare pnpm@latest --activate  # Install pnpm"
  echo "  uv sync                                              # Install Python deps"
  echo "  cd apps/web && pnpm install                          # Install frontend deps"
  exit 1
fi
echo "All prerequisites satisfied."
```

> **Design decision**: The script is intentionally **non-mutating** — it runs no install commands, writes no files. It only checks for the presence of `uv` and `pnpm` and verifies Python packages resolve. Failures produce actionable installation instructions rather than auto-installing.

**Acceptance**: `bash scripts/prereq-check.sh` exits 0 when all deps satisfied, non-zero with actionable instructions otherwise.

---

## File Summary

| Path | Type | Task |
|---|---|---|
| `services/orchestrator/cli.py` | Modify | 7.1 — Managed dual-service `start` + real `status` command |
| `apps/web/src/hooks/use-active-run.ts` | Create | 7.2 — Poll `GET /api/v1/runs/active` |
| `apps/web/src/components/recovery-banner.tsx` | Create | 7.2 — Interrupted-run recovery UI |
| `apps/web/src/components/artifacts/blocked-state-card.tsx` | Create | 7.3 — Dedicated blocked state card |
| `apps/web/src/components/artifacts/index.ts` | Modify | 7.3 — Export `BlockedStateCard` |
| `apps/web/src/components/artifact-panel.tsx` | Modify | 7.3, 7.5 — Fix render logic + add `data-artifact-panel` attribute |
| `apps/web/src/components/settings-screen.tsx` | Create | 7.4 — Settings dialog with health |
| `apps/web/src/components/project-header.tsx` | Modify | 7.4 — Gear icon for settings |
| `apps/web/src/components/command-pane.tsx` | Modify | 7.5 — `view_summary` / `view_handoff_notes` wiring |
| `apps/web/src/components/project-timeline.tsx` | Modify | 7.5 — Add `data-timeline` attribute |
| `apps/web/src/app/page.tsx` | Modify | 7.2 — Add `RecoveryBanner` |
| `apps/web/src/lib/api.ts` | Modify | 7.2, 7.4 — Add `RunRecord`, `fetchActiveRun`, `fetchHealth` |
| `apps/web/src/lib/artifact-stage-mapping.ts` | Modify | 7.3 — Point blocked states to `BlockedStateCard` |
| `apps/web/src/__tests__/recovery-banner.test.tsx` | Create | 7.2 — 8 banner tests |
| `apps/web/src/__tests__/blocked-state-card.test.tsx` | Create | 7.3 — 6 blocked state card tests |
| `services/orchestrator/tests/test_cli.py` | Create | 7.1 — 6 CLI lifecycle tests |
| `services/orchestrator/tests/test_golden_paths.py` | Create | 7.6 — 6 golden path tests (contract-defined) |
| `services/orchestrator/tests/test_error_handling.py` | Create | 7.10 — 7 structured-error tests |
| `services/orchestrator/tests/test_safety.py` | Create | 7.11 — 13 safety-enforcement tests |
| `AGENTS.md` | Create | 7.12 — Canonical agent instructions |
| `scripts/prereq-check.sh` | Create | 7.13 — Prerequisite verification |
| `scripts/smoke-test.sh` | Create | 7.7 — Dual-service smoke test |
| `README.md` | Modify | 7.8 — Update status, adapter description |
| `CONTRIBUTING.md` | Create | 7.9 — Contribution guide |

**Total**: 24 files (14 new, 10 modified)

---

## Verification

```sh
pytest                                       # 232 passed (was 200)
ruff check .                                 # All checks passed
python -m pytest tests/test_cli.py -v        # 6 CLI lifecycle tests
python -m pytest tests/test_golden_paths.py -v  # 6 golden path tests
python -m pytest tests/test_error_handling.py -v # 7 error tests
python -m pytest tests/test_safety.py -v        # 13 safety tests
cd apps/web && pnpm test                    # 30 passed (was 16)
cd apps/web && pnpm run build               # Compiled successfully
bash scripts/prereq-check.sh                # Exits 0 (non-mutating, verifies uv + pnpm)
bash scripts/smoke-test.sh                  # Exits 0 (dual-service, readiness polling, trap cleanup)
```

---

## Deferred Boundaries

| Feature | Rationale |
|---|---|
| Multi-repo support (user-entered repo path) | Requires ActionService plumbing for non-CWD repos; UI path picker; low priority for current use case |
| Full-page settings with mode switching mid-project | Mode switching mid-project is undefined in workflow contract; requires scope decision |
| UI polish: dark mode refinement, animations | Functional parity is sufficient; polish can be continuous |
| `archive_project` action wiring | No current use case for project archival |

---

## Test Coverage

| Area | Test file | Count | Key Coverage |
|---|---|---|---|---|
| CLI lifecycle | `test_cli.py` | 6 | Backend reachable, frontend reachable, frontend not started on backend failure, cleanup SIGINT, cleanup SIGTERM, cleanup on process crash |
| Golden path | `test_golden_paths.py` | 6 | Full lifecycle, existing app with 1 phase, interrupted recovery, approval gate, invalid transition, Phase 1-mode adapter_not_available regression |
| Error handling | `test_error_handling.py` | 7 | Unknown action, no project, invalid transition, active run, no retry target, internal error, artifact not found |
| Safety | `test_safety.py` | 13 | No I/O in engine, approval enforcement, backend authority, single active run, interrupt detection, no auto-rerun, path validation, atomic writes, symlink/boundary escape, secret persistence, raw-HTML-safe rendering, RunRecord template-version/working-directory, artifact-before-event ordering |
| Recovery banner | `recovery-banner.test.tsx` | 8 | 4 recovery choices, running state, empty state, inspect/retry/continue/revise buttons |
| Blocked state card | `blocked-state-card.test.tsx` | 6 | Badge rendering, recovery actions, "What happened", retry |

All existing 200 backend + 16 frontend tests must continue to pass. New tests add 32 backend + 14 frontend = 46 total new tests.
