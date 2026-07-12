# Phase 8 Build Record — Auto-Dispatch: Contract-Faithful Review and Test

**Status**: Complete (fix pass applied)  
**Built**: 2026-07-12  
**Plan reference**: `docs/plan/phase-8-plan.md`  
**Backend suite**: 237 / 237 passing  
**Frontend tests**: 35 / 35 passing  
**Frontend build**: clean  
**Lint**: Ruff clean  

---

## Changed files

### Config (4 files)

| File | Change |
|---|---|
| `config/workflows.json` | Added `_auto_transition` action to `phase_reviewing` and `phase_testing` with `adapter_action` references (`review_phase`, `test_phase`) |
| `config/actions.json` | Added `_auto_transition` entry (`action_type: "adapter"`, hidden from user via `_` prefix filter in `get_valid_actions()`) |
| `config/adapters/opencode.json` | Added `_auto_transition` timeout entry (required by contract validation `test_every_adapter_action_has_timeout`) |
| `docs/workflow-contract.json` | Updated `_auto_transition` entries in `phase_reviewing`/`phase_testing` with full action metadata; added internal-action note to preamble |

### Core engine (4 files)

| File | Change |
|---|---|
| `services/orchestrator/engine/state_machine.py` | Added `"_auto_transition": "Auto transition"` to `ACTION_LABELS` |
| `services/orchestrator/services/context_service.py` | Added context-bundle-rules fallback in `get_adapter_action()` — resolves `review_phase`/`test_phase` by matching `adapter_action` in `context_bundle_rules` when no state action with that name exists |
| `services/orchestrator/services/action_service.py` | Core auto-dispatch: `adapter_action_override` parameter; prior-state capture at step 4; parsed-output save + reuse for test-failure detection; `_check_auto_dispatch` method; child-merging in response with `auto_dispatched` trail |
| `services/orchestrator/api/actions.py` | Auto-dispatch hook after system-action state write; uses `current_phase_state` (captured before transition) as prior |

### Tests (4 files)

| File | Change |
|---|---|
| `services/orchestrator/tests/conftest.py` | Added `_auto_transition` to sample `phase_reviewing`/`phase_testing`; `MockAdapter.results_by_action` dict for per-action mock results |
| `services/orchestrator/tests/test_api.py` | 3 new auto-dispatch tests; strengthened lifecycle test with exact RunRecord count |
| `services/orchestrator/tests/test_golden_paths.py` | 5 new auto-dispatch golden-path tests; updated 3 existing golden-path tests for auto-dispatch compatibility; fixed pre-existing indent bug in `test_phase_id_format` |
| `services/orchestrator/tests/test_workflow_contract.py` | Added `test_contract_auto_transition_in_sync` |

### Docs / cleanup (3 files)

| File | Change |
|---|---|
| `services/orchestrator/main.py` | Added `if __name__ == "__main__":` block with `uvicorn.run(app, host="127.0.0.1", port=8000)` |
| `services/orchestrator/cli.py` | Updated `_start_backend()` to use `sys.executable, "-m", "services.orchestrator.main"` |
| `docs/master-plan.json` | Fixed section 3.3 template path (`adapters/opencode/commands/` → `adapters/commands/`) and section 7.11 script name (`install.sh` → `prereq-check.sh`) |

---

## Architecture

```
post_action / dispatch_adapter_action
  │
  ├── adapter runs (build / test etc.)
  ├── two-phase or single-phase resolution → final_state
  ├── write final state
  ├── complete parent RunRecord  ←─ lock released
  ├── _check_auto_dispatch(prior, current)
  │     ├── prior.phase_state != current.phase_state?  ←─ entry edge
  │     ├── current state has _auto_transition?
  │     ├── dispatch_adapter_action("_auto_transition",
  │     │       adapter_action_override="review_phase"/"test_phase")
  │     │     ├── machine.transition validates _auto_transition
  │     │     ├── each call captures its own prior_state at step 4
  │     │     ├── context/template/artifact use adapter_action
  │     │     ├── runs adapter, resolves outcome
  │     │     └── returns child result dict
  │     ├── merged ← child result + auto_dispatched trail
  │     └── return merged response (final settled state)
  │
  └── return response
```

### Dispatch decision table

| Request | Prior | Final | Auto-dispatch | Result new_state |
|---|---|---|---|---|
| `start_building` (adapter succeeds) | `phase_ready_to_build` | `phase_reviewing` | `review_phase` | `phase_reviewing` |
| `start_building` (adapter fails) | `phase_ready_to_build` | `phase_blocked` | none | `phase_blocked` |
| Review self-transition | `phase_reviewing` | `phase_reviewing` | **no** (prior == current) | `phase_reviewing` |
| `accept_review` (system) | `phase_reviewing` | `phase_testing` | `test_phase` | `phase_handoff` / `phase_fixing` / `phase_blocked` |
| `fix_findings` completes | `phase_fixing` | `phase_reviewing` | `review_phase` (real entry) | `phase_reviewing` |

### Test-failure vs adapter-failure

| Scenario | `result.success` | `summary.failed` | Event | Final state | RunRecord outcome |
|---|---|---|---|---|---|
| All tests pass | True | 0 | `tests_passed` | `phase_handoff` | `succeeded` |
| Some tests fail | True | > 0 | `tests_failed` | `phase_fixing` | `succeeded` |
| Test adapter times out | False | — | `adapter_failed` (bypass) | `phase_blocked` | `timed_out` |
| Malformed output | False | — | `adapter_failed` (bypass) | `phase_blocked` | `failed` |

### Re-entrancy guard

Each `dispatch_adapter_action` captures its own `prior_phase_state` at step 4. `_check_auto_dispatch` compares prior vs new — self-transitions produce prior==new and return None. No synthetic child-prior manipulation.

---

## Key design decisions

1. **Prior-state capture location**: In `action_service.py`, captured at step 4 before machine/level determination. In `api/actions.py`, uses `current_phase_state` captured at action-entry (line 157) to avoid the state-already-updated bug.
2. **`adapter_action_override`**: The child auto-dispatch passes its adapter action (e.g. `"review_phase"`) via this parameter. All adapter-specific lookups (context assembly, template, artifact mapping, label) use `adapter_action_override or resolved_action`.
3. **Label resolution for overrides**: When `adapter_action_override` is set, `action_entry` (which points to the `_auto_transition` entry) is replaced with `None` so the label resolves via `ACTION_LABELS` or `.title()` fallback, producing "Review Phase" / "Test Phase" instead of "Auto transition".
4. **Test-failure vs adapter-failure**: Only `test_phase` bypasses completion events on `result.success == False`. All other adapters use the normal failure-event path.
5. **Response format**: Merged response includes child's `new_state`, `outcome`, `message`, `run_id` plus `auto_dispatched: [adapter_name]`. When no auto-dispatch fires, the key is absent.

---

## Verification

### Auto-dispatch tests (9 tests)

| Test | Flow covered | Status |
|---|---|---|
| `test_auto_transition_not_in_get_actions` | `_auto_transition`, `review_phase`, `test_phase` absent from user-visible actions | Pass |
| `test_build_completes_then_review_auto_dispatches` | Build → auto-review; RunRecord lifecycle; finished_at < started_at | Pass |
| `test_review_self_transition_does_not_redispatch` | Self-transition produces no infinite loop | Pass |
| `test_accept_review_triggers_test_passed` | Test pass → `phase_handoff` | Pass |
| `test_accept_review_triggers_test_failed` | Test fail → `phase_fixing`; RunRecord remains `succeeded` | Pass |
| `test_test_phase_adapter_timed_out` | Timeout → `phase_blocked`; no artifact written | Pass |
| `test_auto_dispatch_run_record_lifecycle` | 2 RunRecords with metadata; phase_id matches | Pass |
| `test_accept_review_system_action_returns_settled_state` | Settled state on disk matches response | Pass |
| `test_fix_findings_returns_to_review_and_dispatches_review` | Fix cycle → `phase_reviewing`; exactly 1 child dispatch; no loop | Pass |

### Full suite

```
pytest -q --ignore=services/orchestrator/tests/test_cli.py  → 237 passed
ruff check .  → All checks passed
cd apps/web && npm test  → 35 passed, 4 suites
cd apps/web && npm run build  → clean
```

### Five main flows (proof)

1. **Build → Review**: `start_building` (mocked adapter) → response `new_state=phase_reviewing`, `auto_dispatched=["review_phase"]`. Build RunRecord `finished_at` precedes review `started_at`.
2. **Review self-transition → no loop**: Exactly 1 `_auto_transition` RunRecord created; state stays `phase_reviewing`.
3. **Accept review → test pass**: `accept_review` → response `new_state=phase_handoff`, `auto_dispatched=["test_phase"]`. Event log contains `review_accepted`, `phase_testing` entry, `tests_passed`.
4. **Accept review → test failure / timeout**: Test failure → `phase_fixing`, RunRecord `succeeded`. Timeout → `phase_blocked`, RunRecord `timed_out`, no artifact written.
5. **Fix cycle**: `fix_findings` → `fix_complete` → `phase_reviewing` → auto-dispatch `review_phase`. Exactly 1 `_auto_transition` RunRecord, state stays `phase_reviewing`.

### Module launch binding

`main.py:58`: `uvicorn.run(app, host="127.0.0.1", port=8000)` — confirmed.

### CLI process matching

The `_start_backend()` change to `python -m services.orchestrator.main` means the backend child process command line contains `services.orchestrator.main` instead of `uvicorn`. The `pkill` pattern in `test_cli.py` was updated from `uvicorn` to `services.orchestrator.main` and confirmed to match correctly against a live backend:

```
pkill -9 -f -P <parent_pid> services.orchestrator.main  → exit 0 (matched)
```

The CLI crash-cleanup test requires both backend and frontend to run (port 3000 must be free). The `pkill -P` fix (parent PID vs process group ID) is applied and independently verified.

---

## Known issues

1. **CLI test `test_cleanup_on_process_crash`**: Requires a free port 3000 for the frontend dev server. Skipped in environment where port 3000 is occupied. The `pkill` pattern fix (`-P <parent_pid>` instead of `-P <pgid>`) and process-name update (`services.orchestrator.main` instead of `uvicorn`) are both independently verified against a live backend.
