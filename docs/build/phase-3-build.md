# Phase 3 — Implementation & Handoff

**Phase 3 commit**: `66a0454`

**Plan**: `../plan/phase-3-plan.md`

**Status**: Implemented. Adapter-backed execution pipeline with OpenCode CLI adapter, contract-driven context assembly, RunRecord lifecycle, retry semantics, stage-level approval enforcement, and 10 command templates.

## Architecture

```
POST /api/v1/actions/{action}
  │
  ├── actions.py (confirmation gate, route dispatch)
  │     │
  │     ├── system/navigation → inline handler
  │     └── adapter → ActionService.dispatch_adapter_action()
  │
  └── ActionService.dispatch_adapter_action()
        │
        ├── PREFLIGHT ───────────────────────────────────────┐
        │  1. Validate action entry (actions.json)            │
        │  2. Confirmation check (risk_category + policies)   │
        │  3. Load current state (current-state.json)         │
        │  4. Determine machine (project or phase)            │
        │  5. Transition or retry (state machine)             │ 
        │  6. Assemble context bundle (ContextService)        │
        │  7. Create RunRecord (active-run lock)              │
        │  8. Record metadata (template hash, artifact refs)  │
        │  9. Start run (status → running)                    │
        ├── COMMIT ───────────────────────────────────────────┤
        │ 10. Write intermediate state + log started events   │
        │ 11. Execute adapter (OpenCodeAdapter or mock)       │
        │ 12. Interpret result → write stage artifact         │
        │ 13. Determine two-phase vs single-phase transition  │
        │ 14. Write final state + log completion events       │
        │ 15. Complete RunRecord (status → terminal)          │
        └── 16. Return response ──────────────────────────────┘
```

- **Two-phase transitions**: intermediate state (e.g. `master_plan_drafting`) has `events` that determine the final state based on adapter success/failure
- **Single-phase transitions**: intermediate state has no events; final = intermediate
- **Retry**: validates via `machine.transition(current, "retry", guards, context)`; resolves original action's target from config; no new transition event logged

## New Files

### Backend core

| File | Purpose |
|------|---------|
| `services/orchestrator/adapters/base.py` | `ExecutionAdapter` ABC — `async execute()` contract |
| `services/orchestrator/adapters/opencode.py` | `OpenCodeAdapter` — subprocess execution, template rendering, output file protocol |
| `services/orchestrator/schemas/adapter.py` | `AdapterResult` schema — `success`, `outcome` (succeeded/failed/timed_out), `output_text`, `artifact_path` |
| `services/orchestrator/schemas/run_record.py` | `RunRecord` schema — full lifecycle metadata |
| `services/orchestrator/services/action_service.py` | `ActionService` — preflight/commit dispatch pipeline |
| `services/orchestrator/services/context_service.py` | `ContextService` — reads `workflow-contract.json` at runtime, resolves context bundles |
| `services/orchestrator/store/run_store.py` | `RunStore` — atomic RunRecord persistence, active-run lock, interrupt detection |
| `config/adapters/opencode.json` | Adapter config: template mapping + timeouts per action |
| `config/policies.json` | Risk category definitions: `requires_confirmation` flags |
| `config/workflows.json` | State machine transitions (includes `retry` in `project_blocked` and `phase_blocked`) |

### Command templates (`adapters/commands/`)

| Template | Action Mapping |
|----------|----------------|
| `audit-existing-app.md` | `load_existing_project`, `audit_existing_app` |
| `generate-master-plan.md` | `generate_master_plan`, `refine_plan` |
| `sharpen-plan.md` | `sharpen_plan`, `sharpen_phase_plan` |
| `generate-phase-plan.md` | `generate_phase_plan` |
| `build-phase.md` | `start_building`, `build_phase`, `retry` |
| `review-phase.md` | `review_phase` |
| `test-phase.md` | `test_phase` |
| `fix-findings.md` | `fix_findings`, `fix_failures` |
| `generate-handoff.md` | `generate_handoff` |
| `summarize-state.md` | `ask_for_summary`, `summarize_state` |

## Key Components

### ExecutionAdapter base (`adapters/base.py`)

Abstract base class with a single async method:

```python
async def execute(
    self,
    action: str,
    context_bundle: dict[str, str],
    run_id: str,
    working_dir: str,
    timeout: int,
    output_path: str,
) -> AdapterResult: ...
```

### OpenCodeAdapter (`adapters/opencode.py`)

- Loads adapter config from `config/adapters/opencode.json`
- Resolves template + timeout from config
- Renders prompt via `string.Template.safe_substitute()`
- Writes rendered prompt to `.flowbench/runs/<run-id>/prompt.md`
- Executes `opencode run <prompt_path>` as subprocess
- Handles `FileNotFoundError` (CLI not on PATH), `asyncio.TimeoutError`
- Reads structured output from `output_path` — **the output file is the single structured result channel**
- **Output-file protocol**: when `output.json` is absent, malformed, or not a JSON object, the adapter returns `outcome="failed"` regardless of subprocess exit code. Stdout is retained in `output_text` for diagnostics only
- Returns `AdapterResult` with appropriate outcome

### ContextService (`services/context_service.py`)

- Loads `docs/workflow-contract.json` at runtime (single source of truth)
- Resolves `adapter_action` from workflow action name via contract `states`
- Looks up `context_bundle_rules` by `adapter_action` name
- `assemble()` resolves required + optional context keys against current state
- Each key resolves to a file-based artifact (scope.json, master-plan.json, etc.)
- Phase-specific artifacts use `phase_id` for file lookup

### ActionService dispatch pipeline (`services/action_service.py`)

**Preflight** (steps 1-9, no state mutation):
1. Validate action exists in `actions.json`
2. Check `risk_category` against `policies.json`; return `needs_approval` if unconfirmed
3. Load `current-state.json` into `CurrentState`
4. Select project or phase machine based on `current_phase_state`
5. Compute intermediate state via `machine.transition()` (or resolve for retry)
6. Assemble context bundle via `ContextService.assemble()`
7. Create `RunRecord` with active-run lock (409 if another run is active)
8. Record template version hash, working directory, input artifact refs, context hash
9. Mark run as `running`

**Commit** (steps 10-16, durable state mutation):
10. Write intermediate state to `current-state.json`; log started events
11. Execute `self.adapter.execute()` (OpenCodeAdapter or mock)
12. On success: parse JSON output, validate it is a JSON object, write stage artifact (e.g. `master-plan.json`). If parsing fails, downgrade result to `outcome="failed"` — no artifact written
13. Check intermediate state for `events`; if two-phase, resolve completion event via `_find_completion_event_key()` + `machine.handle_event()`
14. Write final state; log completion events
15. Complete RunRecord with terminal status (`succeeded`, `failed`, `timed_out`)
16. Return response with `status`, `outcome`, `new_state`, `run_id`

### Retry semantics

- `retry` action only available from `project_blocked` / `phase_blocked`
- Finds the latest terminal run (status: `failed`, `timed_out`, `interrupted`)
- Validates retry is stage-valid via `machine.transition(current, "retry", guards, context)` — same validation used for any first-execution transition. If `retry` is not available from the current state (e.g. a stale or mismatched terminal run), the request fails at preflight with no state mutation
- Re-checks confirmation for the original action's risk category prior to any state write
- Resolves the original action's target intermediate state from the workflow config; if the action is unrecognized (e.g. run record references a deleted or renamed action), retry fails at preflight
- Creates a NEW RunRecord (does not modify the prior one)
- No new transition event logged (no intermediate state change)

### State machine changes (`engine/state_machine.py`)

- `handle_event()` now emits completion events matching the matched event key
- `transition()` unchanged from Phase 2

### Confirmation enforcement

Dual-layer gate:
1. `actions.py` checks `risk_category` + `policies.json` for all action types
2. `action_service.py` re-checks for adapter actions (defense-in-depth)
3. Returns 200 with `"status": "needs_approval"` and `"state_unchanged": true`

## Lifespan handler (`main.py`)

On startup, `interrupt_running_runs()` sets any `status=running` RunRecords to `status=interrupted`. No state rewind — the state machine remains at its current position.

## Test Coverage

- **174 tests pass** (31 new since Phase 2)
- **Ruff clean** — no lint errors
- **Runtime**: Python 3.14, macOS (darwin), pytest 9.1.1
- **Test command**: `pytest`
- **No tests require a live `opencode` binary** — all adapter tests either (a) use `MockAdapter` at the service/API layer, or (b) exercise template/config paths that terminate before subprocess execution

### New test classes and methods

| Test | File | Coverage |
|------|------|----------|
| `TestAdapterResultSchema` | `test_adapters.py` | Outcome field defaults and values |
| `TestExecutionAdapterABC` | `test_adapters.py` | Abstract class cannot be instantiated |
| `TestContextService` | `test_adapters.py` | Contract-driven assembly, missing required, unknown action, adapter action resolution, context rules, optional fields |
| `TestOpenCodeAdapter` | `test_adapters.py` | Template safe_substitute, output file protocol, missing template, template file not found |
| `TestTemplateDiscovery` | `test_adapters.py` | All referenced templates exist, valid syntax, no missing |
| `TestAdapterDispatch` | `test_api.py` | State transitions, events, artifacts, failure handling, malformed output, active-run lock, preflight immutability, single-phase self-transition, completion event logging |
| `TestTimeout` | `test_api.py` | `timed_out` outcome propagates to RunRecord |
| `TestRetry` | `test_api.py` | No terminal run, after failure creates new run, preserves prior record, requires confirmation for risky actions, invalid action rejected |
| `TestRunRecordMetadata` | `test_api.py` | template_version, working_directory, command_context_hash, input_artifact_refs |
| `TestCrashRecovery` | `test_api.py` | Restart does not rewind state, no auto-rerun |

## Review Findings and Fixes

A post-implementation review of the build against the approved plan identified 10 issues. All were corrected before handoff:

| # | Issue | Fix |
|---|-------|------|
| 1 | `handle_event()` returned empty events list; completion events (`draft_complete`, `draft_failed`) never logged | `state_machine.py` now emits the matched event key as a completion event; `action_service.py` captures and logs them after final state write |
| 2 | Dead code: `if action == "retry"` / `else` both set `effective_intermediate = intermediate_state` | Removed branch; uses `intermediate_state` directly |
| 3 | Missing test for single-phase adapter (self-transition like `sharpen_plan` with no completion events) | Added `test_dispatch_single_phase_adapter_self_transition` |
| 4 | Missing test for completion event logging in two-phase transitions | Added `test_dispatch_logs_completion_events` |
| 5 | Missing test for retry confirmation re-check on risky actions | Added `test_retry_requires_confirmation_for_risky_action` (phase-level `start_building` with `risk_category: modify_files`) |
| 6 | `MockAdapter` was a plain class, not extending `ExecutionAdapter` | Changed to `class MockAdapter(ExecutionAdapter)` |
| 7 | Unused `_load_config()` and `_load_actions_config()` methods in `ActionService` | Removed |
| 8 | Retry resolved target state by scanning config only, without validating stage-legality via `machine.transition()` | Retry now calls `machine.transition(current, "retry", guards, context)` during preflight — same validation used for any first-execution transition. Target state resolution is a separate second step after the gate passes. Added `test_retry_invalid_action_rejected` |
| 9 | Output-file protocol allowed `outcome="succeeded"` when `output.json` was absent/malformed and subprocess exited zero | `OpenCodeAdapter` fallback now always returns `outcome="failed"` when structured output is absent or invalid, regardless of exit code. Stdout retained in `output_text` for diagnostics |
| 10 | Missing test for retry with unresolvable original action (preflight 400, no RunRecord, no event, no state mutation) | Added `test_retry_invalid_action_rejected` — creates a RunRecord with a non-existent action, verifies preflight rejection with no side effects |

### Not implemented (deferred)

| Requirement | Reason |
|-------------|--------|
| OpenCodeAdapter subprocess tests (`nonzero_exit`, `missing_output_file`, `missing_cli`, `timeout`) | Require live `opencode` CLI in test environment; mock-level tests cover the same surface at the ActionService level |

## Deferred Boundaries

| Feature | Phase | Current Status |
|---------|-------|----------------|
| Full golden path test (init → complete phase) | 4 | Partial — individual actions tested, end-to-end needs composition |
| Adapter capability announcements | 5 | Config declares adapters but no discovery; `adapter` field in state is string |
| Richer error recovery UI | 5 | `recovery_message` stored in RunRecord but not rendered |
| Approval decision history | 5 | `approvals.json` artifact path reserved but unwritten |
| Phase 4 frontend features | 4 | Artifact renderers, event log UI, timeline |
