# Phase 6 — Existing App Mode

**Plan**: `../plan/phase-6-plan.md`

**Status**: Implemented. Bootstrap handler for `load_existing_project`, two-phase adapter completion events on `scope_ready`, schema-validated audit persistence with `repo_path` enforcement, mode-aware context injection, Python-source-tree template resolution, accessible frontend mode selector, and full backend + frontend test coverage (200 backend, 16 frontend).

## Architecture

```
config/workflows.json + docs/workflow-contract.json
  └── scope_ready.events: audit_complete → scope_ready / audit_failed → project_blocked
  └── project_blocked: retry action (adapter, re-runs audit)

actions.py (modified)
  └── post_action()
        ├── load_existing_project bootstrap (state_data is None)
        │     └── repo_path = str(Path.cwd().resolve())
        │     └── mode = "existing_app"
        │     └── writes current-state.json to disk → dispatches via adapter pipeline
        └── start_new_project bootstrap (unchanged)

action_service.py (modified)
  ├── _resolve_template_path() — resolves templates from Python source tree
  │     (Path(__file__).parents[3] / "adapters" / "commands")
  ├── AuditArtifact.model_validate(output_data) — schema check before persist
  └── repo_path mismatch check — rejects audit output pointing to different directory

state.py (modified)
  └── GET /state → mode, mode_label in response

context_service.py (modified)
  └── assemble() → if state.mode == "existing_app" + existing_app_audit in bundle
        prepend "Current Project State:\n{audit}\n\nScope:\n{scope}"

command-pane.tsx (modified)
  ├── role="radiogroup" mode selector (New Build / Existing App)
  ├── try/finally loading guard
  └── No path input — audit always runs on CWD

project-header.tsx (modified)
  └── "Existing App" badge when mode === "existing_app"
```

## Decision Table Compliance

| Scenario | State | audit.json | Event log | RunRecord | Status |
|----------|-------|-----------|-----------|-----------|--------|
| Valid audit succeeds | `scope_ready` | Written (schema-valid, path-matching) | `project_loaded_existing` + `audit_complete` | `succeeded` | ✅ |
| Adapter failure | `project_blocked` | None | `project_loaded_existing` + `audit_failed` | `failed` | ✅ |
| Malformed (non-JSON) output | `project_blocked` | None | `audit_failed` | `failed` | ✅ |
| Missing required fields | `project_blocked` | None | `audit_failed` | `failed` | ✅ |
| Mismatched repo_path | `project_blocked` | None | `audit_failed` | `failed` | ✅ |
| Retry after failure → success | `scope_ready` | Written (fresh) | `audit_complete` | `succeeded` (new RunRecord) | ✅ |
| Retry after failure → fails again | `project_blocked` | None | `audit_failed` | `failed` (new RunRecord) | ✅ |
| New Build (unchanged) | `scope_ready` | None | `project_created` | N/A (system action) | ✅ |

## Files Changed (12)

### New Files (1)

| File | Purpose |
|------|---------|
| `apps/web/src/__tests__/command-pane.test.tsx` | 7 frontend tests: mode selector render, tab switch, submit, loading state, error handling |

### Modified Files (11)

| File | Change |
|------|--------|
| `config/workflows.json` | Added `audit_complete` / `audit_failed` events to `scope_ready` state |
| `docs/workflow-contract.json` | Added `scope_ready` events with descriptions; added `completion_events` to `load_existing_project`; added `retry` to `project_blocked` |
| `services/orchestrator/api/actions.py` | Added `load_existing_project` bootstrap block (writes state to `CWD/.flowbench/`, reloads `state_data`) |
| `services/orchestrator/api/state.py` | Added `mode` and `mode_label` to GET `/state` response |
| `services/orchestrator/services/action_service.py` | Added `_resolve_template_path()` (source-tree resolution); added `AuditArtifact` schema validation before persist; added `repo_path` mismatch rejection |
| `services/orchestrator/services/context_service.py` | In `assemble()`: if `state.mode == "existing_app"` and `existing_app_audit` in bundle, prepend audit content to scope |
| `adapters/commands/audit-existing-app.md` | Added structured JSON output spec (fields, types, required markers) |
| `apps/web/src/lib/api.ts` | Added `mode`/`mode_label` to `StateResponse`; added `repo_path` to `ActionRequestBody` |
| `apps/web/src/components/command-pane.tsx` | Replaced no-project UI with accessible mode selector (`role="radiogroup"`, `aria-checked`, `<label>`), `try/finally` loading guard |
| `apps/web/src/components/project-header.tsx` | Added "Existing App" blue badge when `mode === "existing_app"` |
| `services/orchestrator/tests/test_api.py` | Added `TestExistingApp` (13 tests): bootstrap, audit artifact, run record, events, failure states, malformed/schema-invalid/mismatched-path rejection, retry with fresh RunRecord, New Build regression |
| `services/orchestrator/tests/test_adapters.py` | Added 3 context-injection tests (audit prepended, new-build isolation, key resolution) + 1 template-resolution regression test |
| `services/orchestrator/tests/test_workflow_contract.py` | Added 3 contract tests: `scope_ready` event sync, `project_blocked.retry` in workflows, `project_blocked.retry` in contract |

## Key Components

### Bootstrap flow (`actions.py`)

```
post_action("load_existing_project")
  │ state_data is None
  ├─ repo_path = str(Path.cwd().resolve())
  ├─ boot_state = CurrentState(mode="existing_app", project_state="starting", ...)
  ├─ store.write_json("current-state.json", ...)
  ├─ state_data = boot_state.model_dump()
  └─ action_type == "adapter" → ActionService.dispatch_adapter_action()
        ├─ Reads state from disk (project_state="starting")
        ├─ Transitions: starting → scope_ready (intermediate)
        ├─ Writes intermediate state (step 10)
        ├─ Executes adapter
        ├─ Step 12: validates output against AuditArtifact + repo_path matching
        ├─ Step 13: evaluates scope_ready events
        │     ├─ success → audit_complete → stay at scope_ready
        │     └─ failure → audit_failed → project_blocked
        └─ Writes final state + completion events
```

### Two-phase adapter via `scope_ready` events

The `scope_ready` state in `workflows.json` previously had `"events": {}`. Adding `audit_complete` and `audit_failed` makes `load_existing_project` behave as a two-phase adapter, matching the existing pattern used by `generate_master_plan`. System actions (`edit_scope`, `cancel_project`) and other adapter paths (`generate_master_plan` → `master_plan_drafting`) are unaffected because they never evaluate `scope_ready` events.

### Template resolution fix

`_resolve_template_path()` uses `Path(__file__).resolve().parents[3]` to find the FlowBench source tree, not `self.repo_path`. This mirrors how `_load_config()` already resolves `config/workflows.json`. Without this fix, templates would not be found when the repo is at a different filesystem path.

### Audit output validation chain

```
Adapter output (JSON string)
  ├─ json.loads() → dict
  ├─ isinstance(dict) check
  ├─ AuditArtifact.model_validate(output_data) — schema check
  │     └─ requires repo_path (str) + generated_at (ISO datetime)
  │     └─ optional fields: framework, directory_structure, entry_points,
  │          dependencies, test_frameworks, git_info
  └─ output_data["repo_path"] == current_state.repo_path — directory check
        └─ Rejects audits claiming a different directory than the active CWD
```

If any check fails, the artifact is not written, `result.success` is set to `False`, the final state becomes `project_blocked`, and the RunRecord is marked `failed`.

### Recovery from `project_blocked` (failed audit)

| Action | Behaviour |
|--------|-----------|
| `retry` | Re-runs `load_existing_project` with fresh context. Creates new RunRecord. Success → `scope_ready`. Failure → stays `project_blocked`. |
| `revise_scope` | Goes to `scope_ready`. No audit re-run. User can `edit_scope` to set scope content (audit context won't be available for planning). |
| `cancel_project` | Ends project. State = `project_complete`. |

## Test Coverage

### Backend — 200 tests pass (+20 from Phase 5)

| Area | File | Count | Key Coverage |
|------|------|-------|--------------|
| `TestExistingApp` | `test_api.py` | 13 | Bootstrap, artifact, run record, events, adapter failure, malformed output, missing fields, mismatched path, retry with fresh RunRecord, mode in API, New Build regression |
| `TestContextService` (extended) | `test_adapters.py` | +3 | Audit prepended to scope, new-build isolation, audit key resolution |
| `TestTemplateDiscovery` (extended) | `test_adapters.py` | +1 | Template resolution from source tree, independent of repo_path |
| `TestContractValidation` (extended) | `test_workflow_contract.py` | +3 | scope_ready event sync, project_blocked.retry in workflows, project_blocked.retry in contract |

### Frontend — 16 tests pass (+7 from Phase 5)

| Test | Assertion |
|------|-----------|
| `renders New Build tab as default with scope textarea` | Default tab shows textarea + Create button |
| `switches to Existing App tab on click` | Click Existing App → Start Audit shown, textarea hidden |
| `switches back to New Build tab` | Click New Build → textarea shown again |
| `disables Audit button while loading` | During API call, button shows "Auditing..." and is disabled |
| `calls postAction on submit` | Click Start Audit → `postAction("load_existing_project")` |
| `shows error toast on failure` | Error response → `toast(errorMsg, "destructive")` |
| `re-enables button after API error` | After error, button re-enabled (loading state reset) |

## Verification

```
pytest                              → 200 passed (was 180)
ruff check .                        → All checks passed
cd apps/web && npm test             → 16 passed (was 9)
cd apps/web && npm run build        → Compiled successfully
```

## Handoff Notes

### Contract authority

`docs/workflow-contract.json` is the authoritative specification for all state transitions and events. `config/workflows.json` must remain in sync. The `test_scope_ready_events_match_contract` test in `test_workflow_contract.py` enforces this for the new `scope_ready` events.

### Phase 7 boundary

The following are explicitly deferred to Phase 7:
- **Entered repo path**: User specifies which directory to audit (requires ActionService plumbing for non-CWD repos)
- **Retry with different path**: Needs UI for re-entering path from `project_blocked`
- **Full golden path test**: 8-step existing_app lifecycle (audit → scope → plan → phase → build → review → test → handoff)
- **`project-modes.json` integration**: Config-driven mode metadata

### CWD-as-repository constraint

Phase 6 assumes the working directory IS the selected repository. `repo_path` is always `str(Path.cwd().resolve())`. The `.flowbench/` directory lives at `CWD/.flowbench/`, consistent with the workflow contract. If Phase 7 introduces multi-repo support, both the store path (for artifacts) and the template path (for adapter commands) must be updated independently.

### Template path decoupling

`_resolve_template_path()` in `action_service.py` resolves templates from `Path(__file__).parents[3] / "adapters" / "commands"`. This is independent of `self.repo_path`. Future changes to the file layout must update this path.

## Review Findings and Fixes

A post-implementation review against the approved plan identified the following:

| # | Issue | Fix |
|---|-------|------|
| 1 | Duplicate `"events"` block in `scope_ready` — the original `"events": {}` at the end of the scope_ready state was never removed when audit events were added. JSON parsers take the last duplicate key, making the new events invisible. | Removed the trailing `"events": {}` from `scope_ready` in `config/workflows.json` |
| 2 | `TestExistingApp.test_bootstrap_creates_runrecord` used `"."` as audit `repo_path` — rejected by the `repo_path` mismatch check | Changed mock output to use `str(Path.cwd().resolve())` |
| 3 | `TestExistingApp.test_bootstrap_logs_started_event` same mismatch issue | Same fix |
| 4 | `TestExistingApp.test_missing_required_fields_rejected` same mismatch issue + missing `json.dumps()` | Used `json.dumps()` with canonical path |
| 5 | Frontend test expected `postAction("load_existing_project", undefined)` — JavaScript passes only 1 argument when 2nd is omitted | Changed expectation to `postAction("load_existing_project")` |
| 6 | `StateResponse` type missing `mode`/`mode_label` fields — frontend build failed with TS error | Added fields to the interface in `api.ts` |

**Commit**: `4378b7c`

### Accepted Config Deviations (Intentional)

| Plan Reference | Deviation | Rationale |
|----------------|-----------|-----------|
| Contract test in `test_state_machine.py` | Test placed in `test_workflow_contract.py` | Correct file — `TestContractValidation` already exists there |
| `ActionRequest.repo_path` removal from plan | Field kept in model | Harmless dead code; removing it is a breaking change to the API contract |
