# Phase 8 — Auto-Dispatch: Contract-Faithful Review and Test

**Status**: Planned. Not yet implemented.

## Purpose

Implement synchronous, contract-faithful auto-dispatch on entry to `phase_reviewing` and `phase_testing`. After a build completes, the review adapter runs automatically. After review is accepted, the test adapter runs automatically. Both remain hidden from the command pane — the user sees the final settled state.

## Architecture

```
post_action / dispatch_adapter_action
  │
  ├── adapter runs (build / test etc.)
  ├── two-phase or single-phase resolution → final_state
  ├── write final state
  ├── complete parent RunRecord  ←─ lock released
  ├── _check_auto_dispatch(prior, current)
  │     ├── prior.phase_state != current.phase_state?  ←─ entry edge check
  │     ├── current state has _auto_transition?  ←─ underscore-filtered
  │     ├── dispatch_adapter_action("_auto_transition",
  │     │       adapter_action="review_phase"/"test_phase")
  │     │     ├── machine.transition validates _auto_transition
  │     │     ├── each dispatch captures OWN prior_state at step 4
  │     │     │   (no synthetic child_prior manipulation)
  │     │     ├── context/template/artifact use adapter_action
  │     │     ├── runs adapter, resolves outcome
  │     │     └── returns child result dict
  │     ├── merged ← child result + auto_dispatched trail
  │     └── return merged response (final settled state)
  │
  └── return response
```

### Dispatch decision table

| Request | Prior phase | Final phase | Auto-dispatch | Result new_state |
|---|---|---|---|---|
| `start_building` (adapter succeeds) | `phase_ready_to_build` | `phase_reviewing` | `review_phase` | `phase_reviewing` |
| `start_building` (adapter fails) | `phase_ready_to_build` | `phase_blocked` | none | `phase_blocked` |
| Review self-transition (review completes) | `phase_reviewing` | `phase_reviewing` | **no** (prior == current) | `phase_reviewing` |
| `accept_review` (system) | `phase_reviewing` | `phase_testing` | `test_phase` | `phase_handoff` / `phase_fixing` / `phase_blocked` |
| `fix_findings` completes → `phase_reviewing` | `phase_fixing` | `phase_reviewing` | `review_phase` (real entry) | `phase_reviewing` |
| Test self-transition (test completes) | `phase_testing` | `phase_handoff`/`phase_fixing` | **no** (entry guard or wrong state) | settled |

The `fix_findings` → `phase_reviewing` row is a real state entry, not a self-transition, so review correctly re-dispatches after fixes.

### Test-failure vs adapter-failure separation

| Scenario | `result.success` | parsed `summary.failed` | Completion event | Final state | RunRecord outcome |
|---|---|---|---|---|---|
| Test adapter runs, all tests pass | `True` | `0` | `tests_passed` | `phase_handoff` | `succeeded` |
| Test adapter runs, some tests fail | `True` | `> 0` | `tests_failed` | `phase_fixing` | `succeeded` |
| Test adapter times out | `False` | — | bypass events | `phase_blocked` | `timed_out` |
| Test adapter returns malformed JSON | `False` | — | bypass events | `phase_blocked` | `failed` |

### Re-entrancy guard (CORRECTED)

Each dispatch captures its own true prior state at step 4. `_check_auto_dispatch` compares that captured prior against the final state after step 14. No synthetic `child_prior` manipulation — the child inherits its natural capture.

```
Build dispatch:
  step 4: prior_phase_state = "phase_ready_to_build"
  step 14: final_state = "phase_reviewing"
  step 16: complete RunRecord
  step 16.5: _check_auto_dispatch(prior="phase_ready_to_build",
                                   new="phase_reviewing")
             → entry edge (prior != new) → dispatch review

Review child dispatch (nested call to dispatch_adapter_action):
  step 4: prior_phase_state = "phase_reviewing"  ← its OWN capture
  step 14: final_state = "phase_reviewing" (self-transition)
  step 16: complete RunRecord
  step 16.5: _check_auto_dispatch(prior="phase_reviewing",
                                   new="phase_reviewing")
             → NO entry edge (prior == new) → no re-dispatch ✓
```

## New / Modified Files

### 1. `docs/workflow-contract.json`

Add executable `_auto_transition` entries to `phase_reviewing` and `phase_testing`. These mirror the `config/workflows.json` entries and keep the contract authoritative:

In `states.phase_reviewing.actions`:
```json
"_auto_transition": {
  "label": "Auto transition",
  "description": "Internal auto-transition. Fires review_phase adapter on entry to phase_reviewing.",
  "risk_category": null,
  "risk_explanation": null,
  "preconditions": [],
  "target_state": "phase_reviewing",
  "artifact_created": "review-findings.json (auto-generated)",
  "event_emitted": "review_generated",
  "adapter_action": "review_phase",
  "recovery": null,
  "action_type": "adapter"
}
```

In `states.phase_testing.actions`:
```json
"_auto_transition": {
  "label": "Auto transition",
  "description": "Internal auto-transition. Fires test_phase adapter on entry to phase_testing.",
  "risk_category": null,
  "risk_explanation": null,
  "preconditions": [],
  "target_state": "phase_testing",
  "artifact_created": "test-results.json (auto-generated)",
  "event_emitted": "test_executed",
  "adapter_action": "test_phase",
  "recovery": null,
  "action_type": "adapter"
}
```

Add a note to the contract preamble or `notes` array:
```
Underscore-prefixed internal actions (_auto_transition) are valid for engine dispatch
but excluded from user-visible valid actions. They document stage-entry auto-dispatch
behavior and keep the contract in sync with workflows.json.
```

### 2. `config/workflows.json`

Add `_auto_transition` action to `phase_machine.states.phase_reviewing.actions`:

```json
"_auto_transition": {
  "target_state": "phase_reviewing",
  "action_type": "adapter",
  "guard": null,
  "event": "review_generated",
  "adapter_action": "review_phase"
}
```

Add `_auto_transition` action to `phase_machine.states.phase_testing.actions`:

```json
"_auto_transition": {
  "target_state": "phase_testing",
  "action_type": "adapter",
  "guard": null,
  "event": "test_executed",
  "adapter_action": "test_phase"
}
```

The `adapter_action` field tells `_check_auto_dispatch` which adapter to call. These are `_`-prefixed so `get_valid_actions()` filters them from user-visible actions immediately.

### 3. `config/actions.json`

Add entry for `_auto_transition` (required by `dispatch_adapter_action` step 1 action validation; never returned by `GET /actions` because `get_valid_actions` filters `_`-prefixed names):

```json
"_auto_transition": {
  "label": "Auto transition",
  "description": "Internal auto-transition action for review and test",
  "risk_category": null,
  "risk_explanation": null,
  "action_type": "adapter"
}
```

No entries for `review_phase` or `test_phase` are needed here — they are never dispatched as top-level actions.

### 4. `services/orchestrator/engine/state_machine.py`

Add to `ACTION_LABELS`:

```python
"_auto_transition": "Auto transition",
```

### 5. `services/orchestrator/services/action_service.py`

#### 5a. Add `adapter_action_override` parameter to `dispatch_adapter_action`

```python
async def dispatch_adapter_action(
    self,
    action: str,
    body: dict | None,
    config: dict,
    actions_config: dict,
    adapter_action_override: str | None = None,
) -> dict | JSONResponse:
```

Replace every use of `action` for adapter-specific lookups with `adapter_action_override or action`:

| Step | Lookup | Current | New |
|---|---|---|---|
| 4 | Save prior phase state | _(not captured)_ | `prior_phase_state = current_state.current_phase_state` |
| 6 | Context assembly | `self.context_service.assemble(action, ...)` | `self.context_service.assemble(adapter_action or action, ...)` |
| — | Template name | `self._get_template_name(action)` | `self._get_template_name(adapter_action or action)` |
| 8 | Artifact refs | `self._build_artifact_refs(action, ...)` | `self._build_artifact_refs(adapter_action or action, ...)` |
| 13 | Artifact filename | `self._map_adapter_action_to_artifact(action, ...)` | `self._map_adapter_action_to_artifact(adapter_action or action, ...)` |
| 13 | Parsed output save | _(not saved)_ | `parsed_output = output_data` (reuse in step 14) |
| 17 | Label | `self._resolve_label(action, ...)` | `self._resolve_label(adapter_action or action, ...)` |

The state-machine transition (step 5) and `actions_config` lookups (steps 1, 2, retry 5b) continue to use `action` (which is `"_auto_transition"` for auto-dispatch).

#### 5b. Add test-failure detection in step 14, reusing parsed output (CORRECTED)

After artifact write (step 13), save parsed output. In step 14, use it for test-failure detection instead of re-parsing `result.output_text`:

```python
# Step 13: Interpret adapter result → write stage artifact
parsed_output = None
if result.success:
    artifact_filename = self._map_adapter_action_to_artifact(
        adapter_action_override or action, current_state
    )
    if artifact_filename:
        try:
            output_data = json.loads(result.output_text)
            if not isinstance(output_data, dict):
                raise ValueError("Adapter output is not a JSON object")
            # schema validation for audit.json
            ...
            parsed_output = output_data  # ← save for step 14 reuse
            self.store.write_json(artifact_filename, output_data)
        except (json.JSONDecodeError, ValueError, OSError) as e:
            result = AdapterResult(
                success=False, outcome="failed",
                output_text=f"Adapter returned invalid output: {e}\n{result.output_text}",
            )

# Step 14: Determine two-phase vs single-phase
adapter_action = adapter_action_override or action
effective_success = result.success

# Distinguish test-result failure from adapter-execution failure
if result.success and adapter_action == "test_phase" and parsed_output:
    summary = parsed_output.get("summary", {}) if isinstance(parsed_output, dict) else {}
    if summary.get("failed", 0) > 0:
        effective_success = False  # tests reported failures → use tests_failed event

intermediate_config = machine.transitions.get(intermediate_state, {})
has_completion_events = bool(intermediate_config.get("events", {}))

if has_completion_events and result.success:
    event_key = self._find_completion_event_key(intermediate_config, effective_success)
    try:
        final_state, completion_events = machine.handle_event(
            intermediate_state, event_key, effective_success, GUARD_MAP, {},
        )
    except StateTransitionError:
        final_state = intermediate_state
        completion_events = []
elif has_completion_events and not result.success:
    # Adapter itself failed (crash/timeout): bypass completion events, go to blocked
    final_state = "phase_blocked" if level == "phase" else "project_blocked"
    completion_events = [{
        "event": "adapter_failed",
        "from_state": intermediate_state,
        "to_state": final_state,
    }]
else:
    final_state = intermediate_state
    completion_events = []
```

RunRecord completion continues to use `result.outcome` — test-failure produces `outcome="succeeded"` with `phase_fixing` state.

#### 5c. Add `_check_auto_dispatch` method (CORRECTED — returns `(result, adapter_action)` tuple)

```python
async def _check_auto_dispatch(
    self,
    prior_state: CurrentState,
    new_state: CurrentState,
    config: dict,
    actions_config: dict,
) -> tuple[dict, str] | None:
    """Check if a phase state entry should trigger auto-dispatch.

    Returns (child_result_dict, adapter_action) when an auto-dispatch
    fires, or None when no entry edge triggers.

    Only fires when current_phase_state actually changes into a state
    that has an _auto_transition action entry. Self-transitions and
    states without _auto_transition are no-ops.

    Each dispatch captures its own prior state at step 4 of
    dispatch_adapter_action. No prior-state manipulation here.
    """
    if prior_state.current_phase_state == new_state.current_phase_state:
        return None  # Not a state entry edge; self-transition produces no re-dispatch

    phase_state = new_state.current_phase_state
    if not phase_state:
        return None

    machine = create_phase_machine(config)
    transitions = machine.transitions
    state_config = transitions.get(phase_state, {})
    auto_entry = state_config.get("actions", {}).get("_auto_transition", {})
    if not auto_entry or auto_entry.get("action_type") != "adapter":
        return None

    adapter_action = auto_entry.get("adapter_action")
    if not adapter_action:
        return None

    result = await self.dispatch_adapter_action(
        "_auto_transition",
        {"confirmed": True},
        config,
        actions_config,
        adapter_action_override=adapter_action,
    )

    # result already has new_state, outcome, message, run_id from child dispatch
    return (result, adapter_action)
```

#### 5d. Call `_check_auto_dispatch` after step 16 with proper merge (CORRECTED)

In `dispatch_adapter_action`, at step 4 capture prior state, and after step 16 (RunRecord complete) call `_check_auto_dispatch`. Merge child result into parent response with `auto_dispatched` trail:

```python
# Step 4 (at top, after determining machine and current):
prior_phase_state = current_state.current_phase_state

# ... steps 5-14 ...

# Step 15: Write final state + log completion events
current_state = self._apply_state(current_state, final_state, level)
current_state.updated_at = datetime.now(timezone.utc)
self.store.write_json("current-state.json", json.loads(current_state.model_dump_json()))
for evt in completion_events:
    self.event_log.append(self._make_event(evt, resolved_action, current_state, level))

# Step 16: Complete RunRecord
self.run_store.complete_run(
    run_id=run.run_id,
    status=result.outcome,
    output_artifact_path=result.artifact_path,
    failure_message=None if result.success else result.output_text[:2000],
)

# Step 16.5: Auto-dispatch on state entry
label = self._resolve_label(adapter_action_override or action, action_entry)
prior = CurrentState(**current_state.model_dump())
prior.current_phase_state = prior_phase_state
auto_result = await self._check_auto_dispatch(prior, current_state, config, actions_config)
if auto_result:
    child_response, adapter = auto_result
    merged = dict(child_response)
    merged["message"] = f"{label}. {child_response.get('message', '')}"
    merged["auto_dispatched"] = [adapter]
    return merged

# Step 17: Return
return {
    "status": "ok" if result.success else "failed",
    "outcome": result.outcome,
    "new_state": final_state,
    "message": f"{'Completed' if result.success else 'Failed'}: {label}.",
    "run_id": run.run_id,
}
```

### 6. `services/orchestrator/services/context_service.py`

Update `get_adapter_action()` with a constrained fallback — only resolve actions that match a declared context-bundle `adapter_action`:

```python
def get_adapter_action(self, action: str) -> str | None:
    for state_def in self._all_states():
        for a_name, a_def in state_def.get("actions", {}).items():
            if a_name == action:
                return a_def.get("adapter_action")
    # Constrained fallback: return action only when it matches
    # a declared context-bundle adapter_action
    for rule in self.contract.get("context_bundle_rules", {}).get("rules", []):
        if rule.get("adapter_action") == action:
            return action
    return None
```

### 7. `services/orchestrator/api/actions.py`

Add auto-dispatch check after system action state write. Save prior phase state before the transition:

```python
# Before transition (around line 273-284):
prior_phase_state = current_state_obj.current_phase_state if current_state_obj else None

# ... transition happens ...

# After state write (around line 410-414):
store.write_json("current-state.json", json.loads(current_state_obj.model_dump_json()))

# Auto-dispatch on phase state entry (system actions only)
if level == "phase" and prior_phase_state != current_state_obj.current_phase_state:
    from services.orchestrator.services.action_service import ActionService
    service = ActionService(".")
    prior = CurrentState(**current_state_obj.model_dump())
    prior.current_phase_state = prior_phase_state
    auto_result = await service._check_auto_dispatch(
        prior, current_state_obj, config, actions_config
    )
    if auto_result:
        child_response, adapter = auto_result
        merged = dict(child_response)
        merged["auto_dispatched"] = [adapter]
        return merged

label = _resolve_label(action, action_entry)
return {
    "status": "ok",
    "new_state": new_state,
    "message": f"{label} completed.",
}
```

### 8. `services/orchestrator/tests/conftest.py`

Add `_auto_transition` to `sample_transitions.phase_machine.states.phase_reviewing.actions` and `phase_testing.actions`:

```python
# In phase_reviewing.actions, add:
"_auto_transition": {
    "target_state": "phase_reviewing",
    "action_type": "adapter",
    "guard": None,
    "event": "review_generated",
    "adapter_action": "review_phase",
},

# In phase_testing.actions, add:
"_auto_transition": {
    "target_state": "phase_testing",
    "action_type": "adapter",
    "guard": None,
    "event": "test_executed",
    "adapter_action": "test_phase",
},
```

### 9. New tests

#### `test_auto_transition_not_in_get_actions` (in `test_api.py`)

Assert that `_auto_transition`, `review_phase`, and `test_phase` never appear in `GET /api/v1/actions` response, regardless of current state.

#### `test_build_completes_then_review_auto_dispatches` (in `test_golden_paths.py`)

Full flow:
1. `start_building` → state is `phase_reviewing`
2. Assert build RunRecord exists with status `succeeded`
3. Assert review RunRecord exists with status `succeeded`
4. Assert build RunRecord `finished_at` < review RunRecord `started_at`
5. Assert `GET /api/v1/actions` excludes `_auto_transition`

#### `test_review_self_transition_does_not_redispatch` (in `test_golden_paths.py`)

1. After build completes → auto-dispatch review → self-transition
2. Assert exactly 1 review RunRecord exists (no infinite loop)
3. Assert state is `phase_reviewing`

#### `test_accept_review_triggers_test_passed` (in `test_golden_paths.py`)

1. Mock adapter returns success for test_phase with output `{"summary": {"passed": 5, "failed": 0}}`
2. `accept_review` → response `new_state` is `"phase_handoff"`
3. Assert response includes `"auto_dispatched": ["test_phase"]`
4. Assert timeline has `phase_testing` entry event and `tests_passed` completion event
5. Assert test RunRecord with `outcome="succeeded"`
6. Assert `test-results-{phase_id}.json` artifact exists

#### `test_accept_review_triggers_test_failed` (in `test_golden_paths.py`)

1. Mock adapter returns success for test_phase with output `{"summary": {"passed": 3, "failed": 2}}`
2. `accept_review` → response `new_state` is `"phase_fixing"`
3. Assert response includes `"auto_dispatched": ["test_phase"]`
4. Assert timeline has `tests_failed` event
5. Assert test RunRecord has `outcome="succeeded"` (adapter ran; tests reported failures)
6. Assert `test-results-{phase_id}.json` artifact exists

#### `test_test_phase_adapter_timed_out` (in `test_golden_paths.py`)

1. Mock adapter returns `success=False, outcome="timed_out"` for test_phase
2. `accept_review` → response `new_state` is `"phase_blocked"`
3. Assert test RunRecord has `outcome="timed_out"`
4. Assert NO test-results artifact written
5. Assert timeline has `adapter_failed` event, not `tests_failed`

#### `test_auto_dispatch_run_record_lifecycle` (in `test_api.py`)

1. After build → review auto-dispatched
2. Assert 2 RunRecords exist (1 build, 1 review)
3. Both have non-null `template_version`, `working_directory`, `command_context_hash`
4. Review RunRecord has `phase_id` matching current phase

#### `test_accept_review_system_action_returns_settled_state` (in `test_api.py`)

1. `accept_review` POST → response `new_state` is the final settled state (handoff/fixing/blocked)
2. Response includes `auto_dispatched` key with `["test_phase"]`
3. State file on disk matches the settled state

#### `test_contract_auto_transition_in_sync` (in `test_workflow_contract.py`)

1. Assert every `_auto_transition` in `config/workflows.json` has a matching entry in `docs/workflow-contract.json` (bidirectional, same as existing action sync tests)
2. Assert every `_auto_transition` in `config/workflows.json` has a matching entry in `config/actions.json`

### 10. Docs and cleanup (Pass 2)

| Step | File | Change |
|------|------|--------|
| 10a | `docs/master-plan.json` | Fix section 3.3 template path: `adapters/opencode/commands/` → `adapters/commands/`; fix section 7.11: `scripts/install.sh` → `scripts/prereq-check.sh` |
| 10b | `services/orchestrator/main.py` | Add `if __name__ == "__main__":` block with `uvicorn.run(app, host="127.0.0.1", port=8000)` |
| 10c | `services/orchestrator/cli.py` | Update `_start_backend()` to use `sys.executable, "-m", "services.orchestrator.main"` instead of uvicorn directly |

## Test verification

```
pytest -q                              # all backend tests + new auto-dispatch tests
ruff check .                           # clean
cd apps/web && npm test                # 35 frontend tests (unaffected)
cd apps/web && npm run build           # clean
```

## Response format

When auto-dispatch fires, the API response includes merged child result plus `auto_dispatched`:

```json
{
  "status": "ok",
  "new_state": "phase_handoff",
  "outcome": "succeeded",
  "message": "Accept review. Completed: Test phase.",
  "run_id": "01J8Z3X...",
  "auto_dispatched": ["test_phase"]
}
```

When no auto-dispatch fires, the field is absent (backward compatible).

## Handoff notes

- `_auto_transition` is a valid underscore-prefixed action in `config/workflows.json` and `docs/workflow-contract.json`. The state machine validates it normally. The `adapter_action` field tells `_check_auto_dispatch` which adapter to call.
- `review_phase` and `test_phase` are **not** in `config/actions.json`. They are not user-dispatchable. They exist only as `adapter_action` values in `_auto_transition` entries, adapter configs, context bundle rules, and command templates.
- The state entry guard (`prior != new`) is the sole re-entrancy protection. Each dispatch captures its own prior state at step 4 — no synthetic manipulation. Self-transitions produce `prior == new` and never re-dispatch.
- Test-failure vs adapter-failure is distinguished by `result.success`. A test that ran to completion sets `success=True`; its output is parsed once in step 13, and the `parsed_output` dict is reused in step 14 for test-failure detection. A timed-out or crashed adapter sets `success=False` and bypasses completion events to go directly to `phase_blocked`.
- `fix_findings` completing → `phase_reviewing` is a real state entry (not a self-transition), so review correctly re-dispatches to verify fixes.
