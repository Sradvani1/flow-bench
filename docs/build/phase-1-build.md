# Phase 1 — Implementation & Handoff

**Phase 1 commit**: `34387d9` — Phase 1: pure orchestration service with state machine, file store, event log, and run persistence

**Status**: Accepted. Ready for Phase 2 planning.

## Purpose

Pure orchestration service: process actions through a two-machine state machine (project + phase), persist state, log events, and manage run records. No adapter execution — adapter actions return `adapter_not_available`.

## Architecture

- **Single active project** stored in `.flowbench/current-state.json`
- **Two state machines**: `project_machine` (lifecycle) and `phase_machine` (phase work), defined in `config/workflows.json` and loaded by `engine/`
- **State machine is pure logic**: zero I/O imports (`json`, `os`, `pathlib` forbidden in `engine/`)
- **Atomic writes**: every file write uses temp-file → fsync → rename pattern
- **Event log** (`.flowbench/events.ndjson`) is informational; `current-state.json` is authoritative

## API Endpoints

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/health` | Returns `{"status": "ok", "version": "0.1.0"}` |
| `GET` | `/api/v1/state` | Returns `current-state.json` or `{"status": "no_project"}` if missing |
| `GET` | `/api/v1/actions` | Lists valid actions for current state; empty list if no project |
| `POST` | `/api/v1/actions/{action}` | Execute action (see below) |
| `GET` | `/api/v1/events` | Paginated event log, optional `level` filter |
| `GET` | `/api/v1/runs` | List all RunRecords |
| `GET` | `/api/v1/runs/active` | Active RunRecord or `null` |
| `GET` | `/api/v1/runs/{run_id}` | Single RunRecord (404 if not found) |

## Action Execution (`POST /api/v1/actions/{action}`)

### Dispatch Order

1. **Unknown action** → 400 `UNKNOWN_ACTION`
2. **Adapter action** (`action_type: "adapter"`) → 200 `adapter_not_available` — no state change, no events, no RunRecord
3. **Navigation action** (`action_type: "navigation"`) → 200 `ok` + label message — no side effects
4. **System action** → validate state file exists (400 `NO_PROJECT` if missing), run state machine transition, apply side effects, persist

### System Action Side Effects

- **State machine transition**: validates guard conditions, returns new state + events
- **Invalid transition** → 400 `INVALID_TRANSITION` with `ErrorResponse` body
- **Special actions**:
  - `start_new_project`, `edit_scope` — write `scope.json` using `ScopeArtifact` Pydantic schema
- **Phase cleanup**: project-level transitions moving away from a phase (`scope_ready`, `master_plan_sharpening`, `project_complete`, `phase_queue_ready`) clear `current_phase_id` and `current_phase_state`
- **`updated_at`**: updated on every system action (not on GET, nav, or adapter)
- **Events**: written to NDJSON event log for state machine events (`event` field non-null)
- **Response**: `{"status": "ok", "new_state": "...", "message": "..."}`

## State Machines

### Project Machine States
`starting` → `scope_ready` → `master_plan_drafting` → `master_plan_sharpening` → `phase_queue_ready` → `phase_in_progress` → `phase_handoff` → `phase_queue_ready` (loop) → `project_complete`

Error paths: `master_plan_drafting` → `project_blocked`; `project_blocked` → `scope_ready` / `master_plan_sharpening` / `project_complete`

Start-over: `project_complete` → `starting`

### Phase Machine States
`phase_starting` → `phase_plan` → `phase_sharpening` → `phase_ready_to_build` → `phase_building` → `phase_reviewing` → `phase_testing` → `phase_handoff` → `phase_complete` → `phase_queue_ready`

Error paths: `phase_plan` → `phase_blocked`; `phase_building` → `phase_blocked`; `phase_fixing` → `phase_blocked`

**Pause** (`pause` action) maps to `phase_blocked` state internally; user-facing label is "Pause", event distinguishes source (`phase_build_paused` vs `fixing_paused` vs `build_failed`)

### Cross-Machine Transitions
- Phase machine → `phase_queue_ready` (via `cancel_phase`, `abandon_phase`, `start_next_phase` from `phase_complete`)
- Event-driven: `all_phases_complete` event in `phase_queue_ready` → `project_complete`

## Guards

Four guard functions in `engine/guards.py`:
- `scope_has_content` — scope content is non-empty after stripping
- `next_phase_exists` — at least one phase queue item with `status == "upcoming"`
- `has_upcoming_phases` — at least 2 upcoming phases
- `all_phases_complete` — all phase queue items have `status == "complete"`

Guard rejection produces user-facing error messages using `PRODUCT_LABELS` and `ACTION_LABELS` maps (no internal state names exposed).

## User-Facing Language

`engine/state_machine.py` defines:
- `PRODUCT_LABELS`: maps internal state names → friendly labels (e.g. `"phase_blocked"` → `"Phase needs attention"`)
- `ACTION_LABELS`: maps internal action names → friendly labels (e.g. `"generate_master_plan"` → `"Generate master plan"`)

All error messages use these maps. Fallback to raw name if no mapping exists.

## File Store

- **Base path**: `<repo>/.flowbench/` — initialized by `FileStore` constructor
- **Path validation**: `_validate_path` ensures resolved path is under base; raises `PermissionError` on escape attempts
- **Atomic writes**: `write_json` writes to temp file (`mkstemp`), `fsync`, then `os.rename`
- **Read**: `read_json` returns `None` for missing files; raises `ValueError` for corrupt JSON
- **`_validate_path` creates parent dirs** as a side effect (accepted for Phase 1)

## Event Log

- **Format**: NDJSON at `.flowbench/events.ndjson`
- **Append**: `json.dumps` with compact separators + newline; flushed but no `fsync` (by design — not authoritative)
- **Read**: reversed (most recent first), supports offset/limit pagination and `level` filter
- **Count**: line count of file

## Run Store

- **Location**: `.flowbench/runs/{run_id}.json`
- **Run lifecycle**: `create_run` (queued) → `start_run` (running) → `complete_run` (succeeded/failed/timed_out/cancelled/interrupted)
- **Single active run lock**: `create_run` raises `RuntimeError` if queued or running run exists
- **ULID**: used for `run_id` (26 chars, alphanumeric, time-sortable)
- **Context hash**: `update_context` recomputes SHA-256 hash from all accumulated `input_artifact_refs`
- **Atomic persist**: `_persist` uses same temp-file → fsync → rename pattern as `FileStore`
- **Startup recovery**: `main.py` lifespan handler calls `interrupt_running_runs()` — modifies run files only, no events emitted, no state mutation

## Error Handling

- **`StateTransitionError`**: caught in `post_action` → 400 `JSONResponse` with `ErrorResponse` body (also registered as global exception handler)
- **Unknown action**: 400 `UNKNOWN_ACTION`
- **No project**: 400 `NO_PROJECT`
- **Run not found**: 404 `RUN_NOT_FOUND`
- **General errors**: caught by global `Exception` handler → 500 `INTERNAL_ERROR`

## Startup Behavior

On service start (`main.py` lifespan):
1. Import `RunStore`
2. Call `interrupt_running_runs()` — marks any `running` runs as `interrupted`
3. No events emitted, no state mutation, no resumption logic

## Naming Conventions

These conventions are enforced by contract tests and used consistently across the codebase:

| Concept | Convention | Example |
|---------|-----------|---------|
| Phase ID | `phase_` + 3-digit zero-padded number | `phase_001`, `phase_012` |
| Run ID | ULID (26 char, time-sortable) | `01J8Z3X...` |
| Approval ID | ULID | same format |
| Decision ID | `decision_` + 3-digit number | `decision_001` |
| Artifact filename | `<type>-<phase_id>.json` | `build-summary-phase_001.json` |

## Duplicate `start_new_project`

- From `starting`: transitions to `scope_ready` (initial creation)
- From `project_complete`: transitions to `starting` (start over)
- From any other state: returns 400 `INVALID_TRANSITION`

## Existing-App (`load_existing_project`) — Phase 1 Behavior

**Implementation decision**: `load_existing_project` is stubbed as `adapter_not_available` in Phase 1, same as all other adapter actions. No RunRecord, no state mutation, no event.

This differs from the earlier revised plan which had described existing-app mode as storing `repo_path` and `mode` at startup time. The actual Phase 1 implementation treats `load_existing_project` purely as a deferred adapter action — no special startup wiring, no partial state initialization. Phases 3+ will implement the adapter method to audit the existing codebase and populate scope from inspection.

Supporting schemas already exist:
- `AuditArtifact` (`schemas/artifacts.py:90`) — stores directory structure, entry points, dependencies, test frameworks, git info
- `AdapterResult` (`schemas/adapter.py`) — generic adapter response wrapper
- `config/adapters/opencode.json` — method entry with timeout configured but no implementation

## Post-Build Audit Results

A narrow contract audit was performed against the revised plan. All nine checkpoints passed:

| Check | Result |
|-------|--------|
| Duplicate `start_new_project` | ✅ 400 `INVALID_TRANSITION` (except `project_complete → starting` cycle) |
| First-run `GET /api/v1/state` | ✅ 200 `{"status": "no_project"}` |
| RunRecord for adapter-unavailable | ✅ No RunRecord created |
| Phase ID normalization | ✅ Contract test validates `phase_NNN` format |
| User-facing event/error language | ✅ `PRODUCT_LABELS` used; no internal state names exposed |
| `updated_at` semantics | ✅ Unchanged on GET/nav/adapter; changed on system action |
| Navigation side effects | ✅ Zero — early return before any mutation |
| Pause vs blocked wording | ✅ "Pause" label; internal `phase_blocked`; event distinguishes source |
| Existing-app boundaries | ✅ Stubbed as `adapter_not_available`; schemas ready for Phase 3+ |

**One bug found and fixed**: `test_adapter_action_no_event` passed `".flowbench/events.ndjson"` to `FileStore.read_json()`, but `FileStore` base is already `.flowbench/`, so the resolved path was `.flowbench/.flowbench/events.ndjson` — a non-existent file. The test passed vacuously. Fixed to check `Path(.flowbench/events.ndjson).exists()` directly. Product behavior was never affected.

## Implementation Deviations from the Revised Plan

| Plan Statement | Actual Phase 1 Behavior | Impact |
|---------------|------------------------|--------|
| Existing-app mode stores `repo_path` and `mode` at startup | `load_existing_project` is fully stubbed (`adapter_not_available`); no startup wiring | Deferred to Phase 3+ adapter implementation |
| Phase cleanup on project-level transitions | Implemented exactly per plan — clears phase state when transitioning away from a phase | None |
| Startup recovery does not emit events | Confirmed — `interrupt_running_runs` only mutates run files | None |
| `_validate_path` creates parent dirs unconditionally | Accepted as Phase 1 side-effect; no behavioral impact | None |

## Deferred Boundaries (Future Phases)

| Feature | Phase | Current Stub / Schema |
|---------|-------|-----------------------|
| `load_existing_project` adapter execution + audit | 3+ | `adapter_not_available`; `AuditArtifact`, `AdapterResult` schemas exist |
| All other adapter actions (`generate_master_plan`, `start_building`, `fix_findings`, etc.) | 3+ | `adapter_not_available` |
| RunRecord creation + lifecycle wiring into action endpoint | 3+ | `RunStore` tested independently; not called from `post_action` |
| `ApprovalRecord` usage | 3+ | Schema exists (`schemas/approvals.py`); not wired into actions |
| `retry` action target state (`phase_blocked` → `phase_blocked`) | 3+ | Marked with `_auto_transition` prefix; filtered from `get_valid_actions` |
| UI / console shell | 2 | Not started |

## Pre-Phase 2 Adapter Boundary Freeze

A contract-first sharpening pass was performed after Phase 1 build completion and before Phase 2 UI work. The goal was to freeze the adapter abstraction boundary so the Phase 2 console shell does not normalize OpenCode-specific assumptions or introduce a second routing system.

**Commit**: `c29f9e5` — "Freeze adapter boundary before Phase 2"

### What Changed

| File | Change |
|------|--------|
| `workflow-contract.json` | Added `ownership_boundary` section declaring FlowBench as system of record for state, transitions, artifacts, events, and run lifecycle. Added `adapter_capabilities` section — descriptive-only mapping of 10 adapter-backed actions keyed by exact snake_case identifiers. Fixed 9 "coding agent"/"the agent" references across 6 actions to backend-neutral "execution tool" language. Fixed `summarize_state` context bundle rules to remove "OpenCode" reference. |
| `config/actions.json` | Fixed 7 "coding agent"/"the agent" references across 5 actions. |
| `config/policies.json` | Fixed 4 `default_explanation` strings to describe risks in builder terms ("This action will...") instead of agent-console terms. |
| `services/orchestrator/api/actions.py` | Updated `adapter_not_available` message to: "This step needs an execution tool that is not available in this setup yet." |
| `../master-plan.md` | Added ownership boundary callout at top of Phase 3 section. |
| `../master-plan.json` | Added ownership boundary as architecture decision. Updated Phase 1.6 embedded message to match new adapter_not_available text. |
| `../plan/phase-1-plan.md` | Updated two references to the old `adapter_not_available` message. |

### Constraints Respected

- No new states, actions, artifacts, recovery paths, or orchestration modes.
- No changes to the state machine graph, actions list, artifact types, or RunRecord semantics.
- Capability metadata is descriptive-only — no dispatch, routing, or context assembly implications.
- `review_phase` remains an explicit adapter-backed action (not grouped under "planning").
- `summarize_state` documented as read-only and non-recovery.
- OpenCode remains adapter one under the frozen boundary.
- All 143 tests pass, ruff clean.

## Test Coverage

143 tests across 7 files:
- `test_api.py` — API endpoint behavior (24 tests)
- `test_state_machine.py` — state machine transitions, events, guards, no-IO (37 tests)
- `test_file_store.py` — file store atomic writes, validation, edge cases (18 tests)
- `test_run_store.py` — run lifecycle, context hash, interrupt, recovery (22 tests)
- `test_event_log.py` — event log append, read, pagination, filtering (6 tests)
- `test_schemas.py` — all Pydantic schema validation (25 tests)
- `test_workflow_contract.py` — config integrity checks (11 tests)

Coverage targets met: `engine/` 95%, `store/` 98%, `schemas/` 100%, `api/` 87%.

All tests pass, lint is clean (`ruff`).
