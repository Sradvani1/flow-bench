# Phase 7 — Polish and Defaults: CLI, Recovery UI, Safety, and Documentation

**Plan**: `../plan/phase-7-plan.md`

**Status**: Implemented. Managed dual-service `flowbench start` with concurrent output streaming, real `flowbench status` command, `uv run`-based backend launch (with `sys.executable` fallback), **child-crash detection** (polling loop monitors both processes; if either exits unexpectedly, the other is killed and the CLI exits with code 1), atexit/EXIT cleanup handlers, interrupted-run recovery banner with four contract-mandated choices (inspect, retry, continue, revise the plan), dedicated blocked-state card with `failure_message` priority, settings screen with backend health indicator, navigation action wiring (`view_summary`, `view_handoff_notes`), secret field filtering across all persistence layers, **cross-machine event propagation on phase completion** (project machine transitions `phase_in_progress → phase_handoff → phase_queue_ready → project_complete` when all phases done), **multi-phase golden-path regression test** (2-phase project: first phase lands on `phase_queue_ready`, second completes to `project_complete`), golden path acceptance tests, CLI lifecycle tests (6/6 pass), structured-error tests, safety-enforcement tests (13), 8 recovery-banner tests, 7 blocked-state-card tests, **managed-CLI smoke test** (launches `flowbench start` via `.venv`, verifies backend health + frontend HTML + project creation + state persistence + SIGINT cleanup + port release, 8/8 pass), smoke test script (works without `uv` via `.venv`), prerequisite check script, updated README, CONTRIBUTING.md, AGENTS.md — **233 backend (227 non-CLI + 6 CLI) + 35 frontend tests pass**, ruff clean, frontend build succeeds.

## Architecture

```
services/orchestrator/cli.py (modified)
  ├── _start_backend() — uv run uvicorn (with sys.executable fallback)
  ├── _start_frontend() — pnpm run dev subprocess
  ├── _wait_for_url() — readiness polling with timeout/interval
  ├── _prefix_output() — threaded concurrent stdout/stderr streaming with [backend]/[frontend] prefixes
  ├── _cleanup() — SIGTERM → wait 5s → SIGKILL for process groups
  ├── start (click) — dual-service launcher with readiness polling + atexit/SIGINT/SIGTERM cleanup
  └── status (click) — FileStore-backed project state display

services/orchestrator/api/actions.py (modified)
  └── System action state update (lines 328-395)
        ├── Phase-level state transitions
        ├── Cross-machine propagation on phase_complete:
        │     ├── Mark phase "complete" in phase-queue.json
        │     ├── Increment phases_complete counter
        │     ├── Project machine: handle_event("phase_completed") → phase_handoff
        │     ├── Project machine: transition("accept_handoff") → phase_queue_ready
        │     ├── Clear current_phase_id / current_phase_state
        │     └── all_phases_complete guard → auto-fire event → project_complete
        └── Log project-level events

apps/web/src/hooks/use-active-run.ts (new)
  └── Polls GET /api/v1/runs/active every 5s, returns { activeRun, isLoading }

apps/web/src/components/recovery-banner.tsx (new)
  └── Amber banner when activeRun.status === "interrupted"
        ├── Inspect current state — scrolls [data-artifact-panel] into view
        ├── Retry — POST retry with confirmed:true
        ├── Continue — local dismiss, no API call
        └── Revise the plan — POST replan_phase (phase-level) or replan_from_here (project-level)

apps/web/src/components/artifacts/blocked-state-card.tsx (new)
  └── Card for project_blocked / phase_blocked states
        ├── Destructive badge + state label
        ├── "What happened" — activeRun.failure_message > last event description > generic
        └── Recovery actions from useActions (adapter, replan_*, cancel_project, replan_phase)

apps/web/src/components/settings-screen.tsx (new)
  └── Dialog with project info (mode, repo path), backend health indicator, version

services/orchestrator/store/file_store.py (modified)
  ├── strip_sensitive() — recursive filter that removes non-empty {password, secret, token, api_key, credential} fields
  └── write_json() — applies strip_sensitive before persistence

services/orchestrator/store/run_store.py (modified)
  └── _persist() — applies strip_sensitive before RunRecord serialization

services/orchestrator/store/event_log.py (modified)
  └── append() — applies strip_sensitive before event line write
```

## Decision Table Compliance

| Scenario | Behaviour | Status |
|----------|-----------|--------|
| `flowbench start` succeeds | Both services start, health polls pass, Ctrl+C stops both | ✅ |
| Backend fails to start | "ERROR: Backend failed to start", last 10 stderr lines, exit 1, frontend never spawned | ✅ |
| Frontend fails to start | "ERROR: Frontend failed to start", last 10 stderr lines, exit 1, backend cleaned up | ✅ |
| SIGINT during run | Both process groups receive SIGTERM → 5s grace → SIGKILL | ✅ |
| SIGTERM during run | Same cleanup as SIGINT | ✅ |
| Backend process crashes externally | atexit handler triggers, both processes cleaned up | ✅ |
| Interrupted run detected | Banner shows with 4 choices: inspect, retry, continue, revise | ✅ |
| Inspect state (interrupted) | Artifact panel scrolls into view, toast shown | ✅ |
| Retry (interrupted) | POST retry with confirmed:true, creates new RunRecord, state invalidated | ✅ |
| Continue (interrupted) | Local dismiss, no API call, polling continues | ✅ |
| Revise plan (project-level) | POST replan_from_here | ✅ |
| Revise plan (phase-level) | POST replan_phase | ✅ |
| Blocked state (project_blocked) | Dedicated card with badge, failure_message or event description, recovery buttons | ✅ |
| Blocked state (phase_blocked) | Same card, actions from useActions | ✅ |
| Settings gear icon | Opens modal with project info + health indicator | ✅ |
| View Summary (navigation) | Scrolls [data-timeline] into view | ✅ |
| View Handoff Notes (navigation) | Scrolls [data-artifact-panel] into view | ✅ |
| Secret field via FileStore | Stripped (key removed) before JSON write | ✅ |
| Secret field via RunStore | Stripped before RunRecord persist | ✅ |
| Secret field via EventLog | Stripped before ndjson append | ✅ |
| Phase completion → project propagation | accept_handoff → phase_complete, project completes (all phases done) | ✅ |
| Multi-phase: first phase done → project lands on phase_queue_ready | project_state == "phase_queue_ready", current_phase_state is None, phases_complete == 1, second phase can start | ✅ |
| Multi-phase: all phases done → project_complete | Final phase accept_handoff → project_state == "project_complete", phases_complete == total_phases | ✅ |
| Child process crash (backend) | Backend exits → frontend killed, CLI exits with non-zero | ✅ |
| Child process crash (frontend) | Frontend exits → backend killed, CLI exits with non-zero | ✅ |
| Managed CLI launch (no `uv`) | `.venv/bin/python -m services.orchestrator.cli start` starts both services | ✅ |
| Managed CLI SIGINT cleanup | Both processes killed, ports released | ✅ |
| New build golden path | scope → plan → phase → build → test → handoff → project_complete | ✅ |
| Existing app golden path | Audit → scope → one complete phase | ✅ |
| Interrupted run recovery (backend) | RunRecord with status=running → interrupt → detected by GET /runs/active | ✅ |
| Approval gate | Risky action without confirmed → needs_approval, state unchanged, no RunRecord | ✅ |
| Invalid transition | 400 with INVALID_TRANSITION error_code, suggested_action, state unchanged | ✅ |
| Adapter not available (Phase 1 mode) | adapter_not_available with explanation, state unchanged | ✅ |

## Files Changed (25 total)

### New Files (14)

| File | Purpose |
|------|---------|
| `apps/web/src/hooks/use-active-run.ts` | Poll `GET /api/v1/runs/active` every 5s |
| `apps/web/src/components/recovery-banner.tsx` | Interrupted-run recovery UI with 4 contract-mandated choices |
| `apps/web/src/components/artifacts/blocked-state-card.tsx` | Dedicated blocked state card with failure_message priority |
| `apps/web/src/components/settings-screen.tsx` | Settings dialog with project info and backend health |
| `apps/web/src/__tests__/recovery-banner.test.tsx` | 8 banner tests: empty, running, interrupted, 4 choices, revise action selection |
| `apps/web/src/__tests__/blocked-state-card.test.tsx` | 7 card tests: phase/project blocked, recovery actions, "What happened", failure_message priority, retry dispatch |
| `services/orchestrator/tests/test_cli.py` | 6 CLI lifecycle tests: backend reachable, cleanup SIGINT/SIGTERM, cleanup on process crash, frontend-not-started-when-backend-fails, status no-project |
| `services/orchestrator/tests/test_golden_paths.py` | 6 golden path tests: new build lifecycle (project_complete), existing app with 1 phase, interrupted run recovery, approval gate, invalid transition, Phase 1-mode adapter regression |
| `services/orchestrator/tests/test_error_handling.py` | 7 structured-error tests: unknown action, no project, invalid transition, active run, no retry, internal error 500, artifact not found |
| `services/orchestrator/tests/test_safety.py` | 13 safety tests: no I/O in engine, approval enforcement, backend authority, single active run, interrupt detection, no auto-rerun, path validation, atomic writes, symlink escape, secret persistence, no dangerouslySetInnerHTML, RunRecord fields, artifact-before-event ordering |
| `AGENTS.md` | Canonical agent instructions for FlowBench |
| `scripts/prereq-check.sh` | Non-mutating prerequisite verification (uv/pnpm toolchain) |
| `scripts/smoke-test.sh` | Dual-service smoke test with readiness polling and trap cleanup |
| `CONTRIBUTING.md` | Contribution guide (dev setup, tests, conventions, PR workflow, adapter guide) |

### Modified Files (11)

| File | Change |
|------|--------|
| `services/orchestrator/cli.py` | Managed `flowbench start` with concurrent `_prefix_output` (threaded), `uv run` backend with `sys.executable` fallback, FileStore-backed `status`, atexit + SIGINT/SIGTERM cleanup handlers |
| `services/orchestrator/api/actions.py` | Cross-machine event propagation on phase completion: mark phase complete in queue, increment counter, fire project machine events (`phase_completed → accept_handoff → all_phases_complete`), clear phase state vars |
| `services/orchestrator/store/file_store.py` | Added `strip_sensitive()` function + call in `write_json()` to filter secret fields |
| `services/orchestrator/store/run_store.py` | Added `strip_sensitive()` call in `_persist()` before RunRecord serialization |
| `services/orchestrator/store/event_log.py` | Added `strip_sensitive()` call in `append()` before event line write |
| `apps/web/src/components/artifact-panel.tsx` | Added `data-artifact-panel` attribute for navigation scroll; added `BlockedStateCard` renderer support by checking `rendererName` instead of `filename === null` |
| `apps/web/src/components/project-timeline.tsx` | Added `data-timeline` attribute for `view_summary` navigation scroll |
| `apps/web/src/components/command-pane.tsx` | Added `view_summary` (scroll `[data-timeline]`) and `view_handoff_notes` (scroll `[data-artifact-panel]`) handlers |
| `apps/web/src/components/project-header.tsx` | Added gear icon button opening `SettingsScreen` dialog |
| `apps/web/src/app/page.tsx` | Added `RecoveryBanner` above the three-pane layout |
| `apps/web/src/lib/api.ts` | Added `RunRecord` type, `fetchActiveRun()`, `fetchHealth()`, `repo_path` to `StateResponse` |
| `apps/web/src/lib/artifact-stage-mapping.ts` | Pointed `project_blocked` and `phase_blocked` to `BlockedStateCard` |
| `apps/web/src/components/artifacts/index.ts` | Exported `BlockedStateCard` |
| `README.md` | Updated project status to "Phase 7 — feature complete", updated adapter description, added `flowbench status`, smoke test command, updated architecture diagram |

## Key Components

### CLI: concurrent `_prefix_output` with threading

The plan required backend and frontend stdout/stderr forwarded concurrently with `[backend]` and `[frontend]` prefixes. The original implementation called `_prefix_output` sequentially — the frontend output loop only started after the backend process exited, which with long-running processes meant frontend output was never shown.

**Fix**: `_prefix_output` spawns daemon threads for each stream (stdout, stderr), reads both concurrently, then calls `proc.wait()`. The `start` command spawns two daemon threads, one per process, and joins both:

```python
def _prefix_output(proc: subprocess.Popen, prefix: str):
    def _read(stream, write):
        for line in stream:
            write(f"[{prefix}] {line}")
            write.flush()
    threads = []
    if proc.stdout:
        t = threading.Thread(target=_read, args=(proc.stdout, sys.stdout), daemon=True)
        t.start(); threads.append(t)
    if proc.stderr:
        t = threading.Thread(target=_read, args=(proc.stderr, sys.stderr), daemon=True)
        t.start(); threads.append(t)
    proc.wait()
    for t in threads: t.join()
```

### Cross-machine event propagation on phase completion

This is the core architecture fix for Phase 7. Previously, when the phase machine completed (via `accept_handoff`), only the phase-level state was updated (`current_phase_state = "phase_complete"`). The project machine was never consulted, leaving `project_state` stuck at `"phase_in_progress"`.

The fix adds a propagation step inside `api/actions.py` after any phase-level transition to `phase_complete` (covering both `accept_handoff` and `skip_phase`):

```
Phase machine transition → phase_complete
  1. Mark current phase status = "complete" in phase-queue.json
  2. Increment current_state_obj.phases_complete
  3. Build fresh project machine + guard context
  4. project_machine.handle_event("phase_completed", True)
       → project_state: phase_in_progress → phase_handoff
  5. project_machine.transition("accept_handoff")
       → project_state: phase_handoff → phase_queue_ready
  6. Clear current_phase_id = None, current_phase_state = None
  7. Check all_phases_complete(proj_context)
       → if true: project_machine.handle_event("all_phases_complete", True)
         → project_state: phase_queue_ready → project_complete
  8. Log all project-level events
```

The response `new_state` retains `"phase_complete"` for backward compatibility. The UI reads the updated `project_state` from `GET /api/v1/state`.

#### `skip_phase` coverage

`skip_phase` in the phase machine's `phase_starting` state also targets `phase_complete`. Because the propagation code triggers on any `level == "phase"` transition to `new_state == "phase_complete"`, `skip_phase` automatically benefits — the project machine receives `phase_completed`, transitions to `phase_queue_ready`, and auto-fires `all_phases_complete` if applicable.

#### Golden path verification

The `test_new_build_golden_path` test now verifies:

```python
resp = client.post("/api/v1/actions/accept_handoff")
assert resp.json()["new_state"] == "phase_complete"
state_resp = client.get("/api/v1/state")
assert state_resp.json()["project_state"] == "project_complete"
assert state_resp.json()["current_phase_state"] is None
assert state_resp.json()["phases_complete"] == 1
```

This matches the authoritative contract: after the only phase completes, the project reaches `project_complete`.

### Recovery banner: three fixes from plan review

1. **Inspect** — Originally showed a toast with generic text. Fixed to scroll `[data-artifact-panel]` into view (matching navigation action pattern from section 7.5), then show the toast as supplemental feedback.

2. **Revise the plan** — Originally always POSTed `replan_from_here`. Fixed to check `state.current_phase_state`: if truthy (we're inside a phase), POST `replan_phase`; otherwise POST `replan_from_here`. Uses `useProjectState` hook.

3. **What happened** — `BlockedStateCard` originally used only the last event description. Fixed to check `activeRun.failure_message` first (from the interrupted RunRecord), fall back to last event description, then generic. Uses `useActiveRun` hook.

### Secret field filtering across all stores

Added `strip_sensitive()` to `file_store.py`: recursively walks a dict, removes any key whose lowercase form matches `{password, secret, token, api_key, credential}` if it has a truthy value. Applied at the write point for all three persistence layers:

- `FileStore.write_json()` — strips before JSON serialization
- `RunStore._persist()` — strips after `model_dump_json()` deserialization
- `EventLog.append()` — strips before ndjson line write

No filtering at read time — data is already clean on disk.

### Child-crash detection via polling loop

The original `start` command used `t_backend.join()` / `t_frontend.join()` which blocked indefinitely — if either child process crashed, the CLI parent stayed alive. The fix replaces joins with a 500ms polling loop that checks `proc.poll()` on both processes:

```python
try:
    while backend.poll() is None and frontend.poll() is None:
        time.sleep(0.5)
finally:
    _cleanup(*processes)

click.echo("ERROR: A service exited unexpectedly", err=True)
sys.exit(1)
```

When a child exits, the loop terminates, `_cleanup` kills the other child, and the CLI exits with code 1. Ctrl+C still works correctly: the SIGINT handler calls `_cleanup` + `sys.exit(0)`, which interrupts the `time.sleep()` call and propagates through the `finally` block (which is idempotent).

### CLI `uv run` fallback

`_start_backend()` checks `shutil.which("uv")`. If `uv` is on `$PATH`, it launches via `["uv", "run", "uvicorn", ...]`. Otherwise it falls back to `[sys.executable, "-m", "uvicorn", ...]`. This ensures the CLI works both in environments with and without `uv` installed.

### Test error-handling: reliable 500 trigger

The original test wrote a `nonexistent_state` value which triggered `StateTransitionError` (400), not a true 500. Fixed to write truncated JSON (`'{"schema_version": 1, "project_state":'`) to the state file, causing a `ValueError` in `FileStore.read_json()` on the next action dispatch. The test uses `TestClient(app, raise_server_exceptions=False)` to capture the 500 response instead of letting the TestClient re-raise the exception.

## Test Coverage

### Backend — 227 tests pass (+27 from Phase 6)

| Area | File | Count | Key Coverage |
|------|------|-------|--------------|
| CLI lifecycle | `test_cli.py` | 6 | Backend reachable, cleanup SIGINT/SIGTERM, cleanup on process crash*, frontend-not-started-when-backend-fails, status no-project |
| Golden path | `test_golden_paths.py` | 7 | Single-phase full lifecycle (project_complete), multi-phase regression (phase_queue_ready after non-final phase, project_complete after final), existing app with 1 phase, interrupted run recovery, approval gate, invalid transition, Phase 1-mode adapter regression |
| Error handling | `test_error_handling.py` | 7 | Unknown action, no project, invalid transition, active run, no retry, internal error 500 (corrupt JSON), artifact not found |
| Safety | `test_safety.py` | 13 | No I/O in engine, approval enforcement, backend authority, single active run, interrupt detection, no auto-rerun, path validation, atomic writes, symlink escape, secret persistence (FileStore+RunStore+EventLog), no dangerouslySetInnerHTML, RunRecord template-version/working-directory/context-hash, artifact-before-event crash simulation |

### Frontend — 35 tests pass (+19 from Phase 6)

| Area | File | Count | Key Coverage |
|------|------|-------|--------------|
| Recovery banner | `recovery-banner.test.tsx` | 8 | No active run, running status (not shown), interrupted (shown), 4 choice buttons, inspect scrolls+toast, retry dispatches, continue dismisses, revise uses correct action |
| Blocked state card | `blocked-state-card.test.tsx` | 7 | Phase blocked badge, project blocked badge, recovery actions, last event, not-blocked hides, retry dispatches, failure_message priority over events |

### Test counts progression

| Phase | Backend | Frontend | Total |
|-------|---------|----------|-------|
| Phase 1 | — | — | — |
| Phase 2 | — | — | — |
| Phase 3 | — | — | — |
| Phase 4 | — | — | 16 |
| Phase 5 | 180 | 9 | 189 |
| Phase 6 | 200 | 16 | 216 |
| **Phase 7** | **233** | **35** | **268** |

Note: All 233 backend tests execute in a single `pytest` run (227 non-CLI + 6 CLI). No tests are excluded.

## Verification

### Full suite (233 backend + 35 frontend, zero failures)

```
pytest -q                               # all 233 backend tests
  → 233 passed
ruff check . --quiet
  → All checks passed
cd apps/web && npx jest --no-coverage   # all 35 frontend tests
  → 35 passed
cd apps/web && pnpm run build
  → Compiled successfully
```

### Managed-CLI smoke test (bash scripts/smoke-test.sh, zero exit)

The smoke test launches `flowbench start` via `.venv/bin/python -m services.orchestrator.cli start` (no `uv` required), runs 8 checks, then sends SIGINT and verifies cleanup:

```
=== Phase A: Managed CLI ===
  PASS  Backend reachable
  PASS  Backend health JSON (version: 0.1.0)
  PASS  Frontend reachable
  PASS  Frontend HTML (11463 bytes)
  PASS  Project creation (new_state: scope_ready)
  PASS  State persistence (project_state: scope_ready)
  PASS  CLI exited after SIGINT
  PASS  Ports released after cleanup
=== Results: 8 passed, 0 failed ===
```

### CLI lifecycle results

| Test | Port | Result | Notes |
|------|------|--------|-------|
| `test_backend_starts_and_is_reachable` | 8001 | ✅ pass | uvicorn starts, health responds |
| `test_cleanup_on_sigterm` | 8002 | ✅ pass | SIGTERM → process exits within 5s |
| `test_cleanup_on_sigint` | 8003 | ✅ pass | SIGINT → process exits within 5s |
| `test_cleanup_on_process_crash` | 8000+3000 | ✅ pass | Backend killed → CLI detects crash → frontend killed → CLI exits |
| `test_frontend_not_started_when_backend_fails` | 8000 | ✅ pass | Port occupied → backend error, frontend never spawned |
| `test_status_no_project` | — | ✅ pass | No state → "No project set up yet" |

## Handoff Notes

### Cross-machine propagation is now implemented

The two-machine architecture (project + phase) now correctly propagates phase completion to the project machine. When the phase machine transitions to `phase_complete` (via `accept_handoff` or `skip_phase`), the project machine receives the `phase_completed` event, transitions through `phase_handoff` → `accept_handoff` → `phase_queue_ready`, and auto-fires `all_phases_complete` if all phases are done. The `current_phase_state` is cleared, returning control to the project-level machine.

This means:
- Non-final phase: project lands in `phase_queue_ready`, ready for `start_next_phase`
- Final phase: project auto-advances to `project_complete`

The propagation lives in `api/actions.py` in the system action dispatch path only (lines 328-395). Adapter actions that complete indirectly through `accept_handoff` (a system action) are covered because `accept_handoff` goes through this path.

### Child-crash detection is now implemented

When either child process (backend or frontend) exits unexpectedly during `flowbench start`, the CLI detects it via a 500ms polling loop, kills the other child via `_cleanup`, and exits with code 1. This is tested by `test_cleanup_on_process_crash` (kills backend → verifies CLI exits).

The signal handler (Ctrl+C) still works correctly: it calls `_cleanup` + `sys.exit(0)`, which interrupts the polling loop's `time.sleep()` and propagates through the `finally` block. The `finally` block's `_cleanup` call is idempotent.

### CLI uses `uv run` with `sys.executable` fallback

`_start_backend()` checks `shutil.which("uv")` at import time. If `uv` is available, it launches `["uv", "run", "uvicorn", ...]` matching the `uv run flowbench` usage pattern. Otherwise it falls back to `[sys.executable, "-m", "uvicorn", ...]`. The `flowbench` console entry point remains defined in `pyproject.toml: [project.scripts] flowbench = "services.orchestrator.cli:main"`.

CLI tests use `sys.executable -m services.orchestrator.cli` for reliability — `uv` may not be in CI environments.

### Secret filtering is drop-silent

`strip_sensitive()` silently removes matching keys from data before persistence. No log, no warning, no error. If a secret field is inadvertently included in any schema that flows through FileStore/RunStore/EventLog, it is silently stripped. This is by design — emitting a warning could itself leak information through log files.

### `all_phases_complete` is auto-fired, not a separate endpoint

The plan described `POST /api/v1/events/all_phases_complete` as a separate step. The implementation auto-fires the `all_phases_complete` event on the project machine immediately after the `accept_handoff` propagation, by checking the `all_phases_complete` guard against the phase queue. This means the test's final step is implicit — the test verifies `project_complete` directly after `accept_handoff` rather than posting to a separate endpoint.

### Review Findings and Fixes

A post-implementation review against the approved plan identified 14 issues across 4 categories. All were corrected:

| # | Category | Issue | Fix |
|---|----------|-------|-----|
| 1 | Bug | `_prefix_output` blocks sequentially — frontend output never shown | Threaded concurrent stream reading (cli.py) |
| 2 | Bug | "Revise the plan" always uses `replan_from_here` regardless of level | Check `current_phase_state` → use `replan_phase` or `replan_from_here` |
| 3 | Bug | "Inspect current state" shows toast instead of scrolling panel | Scroll `[data-artifact-panel]` into view, then toast |
| 4 | Bug | "What happened" ignores `failure_message` from terminal run | Check `activeRun.failure_message` first, then event fallback |
| 5 | Missing test | `test_frontend_not_started_when_backend_fails` doesn't verify frontend isn't spawned | Occupy port 8000, verify "Starting frontend" absent |
| 6 | Missing test | `test_cleanup_on_process_crash` only manages single backend process | Start full CLI with both services, kill backend, verify cleanup |
| 7 | Missing test | `test_new_build_golden_path` missing `sharpen_plan` step | Added sharpen_plan adapter call |
| 8 | Missing test | Only 7 recovery-banner tests, plan specifies 8 | Added 8th test: "revise button uses correct action based on project state" |
| 9 | Weak test | `test_internal_error_returns_500` triggers StateTransitionError (400) not 500 | Write truncated JSON to force ValueError, use `raise_server_exceptions=False` |
| 10 | Weak test | `test_secret_persistence` only checks current state is clean | Write secret values via FileStore+RunStore+EventLog, verify stripped on read-back |
| 11 | Weak test | `test_artifact_before_event_ordering` doesn't simulate crash | Patch `write_json` to raise OSError, verify event count unchanged |
| 12 | Deviation | Backend uses `sys.executable -m uvicorn` instead of `uv run` | Changed to `["uv", "run", "uvicorn", ...]` with `sys.executable` fallback |
| 13 | Deviation | `status` reads file directly instead of FileStore | Changed to `FileStore.read_json("current-state.json")` |
| 14 | Architecture | Phase completion doesn't propagate to project machine | Cross-machine event propagation in `api/actions.py`: `phase_completed → accept_handoff → all_phases_complete`. Verified with single-phase (→ project_complete) and multi-phase (→ phase_queue_ready → project_complete) golden path tests. |
| 15 | Bug | Child process crash leaves CLI parent alive (blocked on join) | Replaced `join()` with 500ms polling loop checking `proc.poll()`. When either process exits, the other is killed and CLI exits with code 1. |

### Accepted Config Deviations (Intentional)

| Plan Reference | Deviation | Rationale |
|----------------|-----------|-----------|
| `POST /api/v1/events/all_phases_complete` endpoint | Auto-fired from guard check instead of separate endpoint | No new API endpoint needed; the guard runs immediately after phase completion |
| CLI tests use `sys.executable -m services.orchestrator.cli` instead of `uv run flowbench` | Tests rely on `python -m` for reliability | `uv` may not be available in test CI; `python -m` guarantees the same module resolution |
