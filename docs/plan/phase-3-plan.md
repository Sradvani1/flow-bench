# Phase 3 — Execution Backend: Adapter Dispatch, Confirmation Gating, and Context Assembly

**Status**: ✅ Complete  
**Completed**: 2026-07-12  
**Based on commit**: Phase 2 complete → Phase 3 implemented in this session
**Plan format**: Follows `phase-2-plan.md` conventions.

## Goal

Replace the `adapter_not_available` stub with a real dispatch pipeline that:
- Enforces backend-side `confirmed` flag checking for all actions with `risk_category` (both system and adapter)
- Acquires the active-run lock before any state mutation (preflight/commit split)
- Assembles context bundles from `workflow-contract.json` at runtime (not inline)
- Discovers templates via filesystem glob against the adapter command directory
- Uses `string.Template.safe_substitute()` for `$variable` substitution
- Passes a structured output-file path to the adapter and validates returned artifacts
- Persists workflow stage artifacts (e.g., `master-plan.json`) atomically before final state advancement
- Transitions state through the two-phase adapter lifecycle (intermediate "in progress" state → completion event → final state)
- Records full RunRecord metadata (`template_version`, `working_directory`, `input_artifact_refs`, `command_context_hash`)
- Distinguishes `timed_out` from `failed` outcomes
- Implements `retry` with proper terminal-run selection, fresh context, re-confirmation, and new RunRecord
- Never auto-rewinds state on restart (only marks RunRecords as `interrupted`)

## Non-Goals (Explicitly Out of Scope)

- **No auto-transition** — `review_phase` and `test_phase` are user-triggered adapter actions, not auto-dispatched on state entry (Phase 4).
- **No background dispatch** — adapter execution blocks the HTTP request. FastAPI timeout handling for 600s builds is deferred (Phase 4+).
- **No Jinja2 or other template engine** — `string.Template` only.
- **No artifact renderer changes** — the artifact panel still shows raw JSON (Phase 4).
- **No policy engine** — risk explanations still come from `actions.json`. The `confirmed` check is inline in the dispatch pipeline (Phase 5 would extract this into a shared engine).
- **No recovery UI** — interrupted-run recovery banner is still Phase 7.
- **No CLI changes** — `flowbench` CLI untouched.
- **No `load_existing_project` golden path** — Phase 3 focuses on `new_build` mode only.

## Dependencies

- Phase 2 is complete (commit `3dc890e`).
- `workflow-contract.json` is loaded at runtime by `ContextService` for adapter_action mapping and context bundle rules.
- `config/adapters/opencode.json` is loaded at runtime by `OpenCodeAdapter` for template→timeout mapping.
- `opencode` CLI must be available on `$PATH` for adapter execution. The adapter handles `FileNotFoundError` gracefully with a clear error message.
- No additional Python packages needed (`string.Template` is stdlib).

## Architecture

### Preflight / Commit Split

The dispatch pipeline is split into two phases. If any preflight step fails, no state mutation occurs.

```
POST /actions/{action} (adapter type)
  │
  ├── PREFLIGHT (no state mutation)
  │   ├─ 1. Validate action entry from actions.json; 400 if unknown
  │   ├─ 2. Check risk_category → policies.json requires_confirmation
  │   │      If required AND body.confirmed == False
  │   │        → return 200 {status: "needs_approval", ...}
  │   ├─ 3. Load current-state.json, parse CurrentState
  │   ├─ 4. Determine machine (project or phase)
  │   ├─ 5. If action is "retry":
  │   │      a. Find latest terminal failed/timed_out/interrupted RunRecord for this workflow level
  │   │      b. Resolve original action; re-check confirmation for its risk_category
  │   │      c. Validate action is stage-valid from current blocked state
  │   │      d. Reassemble fresh context bundle
  │   │   Else:
  │   │      a. Run machine.transition() → intermediate_state, started_events
  │   │      (do NOT write state yet)
  │   ├─ 6. Assemble context bundle from workflow-contract.json rules
  │   ├─ 7. Create RunRecord via RunStore.create_run() → acquires active-run lock
  │   ├─ 8. Record metadata on RunRecord:
  │   │      - working_directory (resolved repo path)
  │   │      - template_version (SHA-256 of template file)
  │   │      - input_artifact_refs (context key → artifact path)
  │   │      - command_context_hash (SHA-256 of assembled context)
  │   ├─ 9. Start run via RunStore.start_run()
  │   │
  │   ├── COMMIT (state mutation begins)
  │   ├─10. Write intermediate state to current-state.json + log started event(s)
  │   ├─11. Execute adapter:
  │   │      a. Render template via string.Template.safe_substitute(context_bundle)
  │   │      b. Inject $output_path pointing to .flowbench/runs/<run-id>/output.json
  │   │      c. Write rendered prompt to .flowbench/runs/<run-id>/prompt.md
  │   │      d. Run: opencode run .flowbench/runs/<run-id>/prompt.md
  │   │      e. Read output file at $output_path
  │   │         - If valid → use as structured result
  │   │         - If missing/invalid → fallback to stdout, mark failed
  │   ├─12. Interpret result → write stage artifact:
  │   │      Map adapter_action to expected artifact (e.g., generate_master_plan → master-plan.json)
  │   │      Validate output against expected structure
  │   │      Atomic write via FileStore.write_json()
  │   ├─13. Target state has events?
  │   │      YES → two-phase:
  │   │        a. Find event key matching outcome (_complete/_passed for success, _failed for failure)
  │   │        b. machine.handle_event(intermediate_state, event_key, success, ...)
  │   │        c. → final_state, completion_events
  │   │      NO → single-phase (self-transition adapters):
  │   │        final_state = intermediate_state, completion_events = []
  │   ├─14. Write final state + log completion event(s)
  │   └─15. Complete RunRecord (status: succeeded/failed/timed_out)
  │
  └─16. Return {status: "ok"/"failed", new_state, message, run_id}
```

### State mutation discipline

- **Preflight failure**: no state written, no event logged, no RunRecord created. The caller sees an error response and the state machine is unchanged.
- **Commit failure**: the intermediate state is already written, the RunRecord is already `running`. The dispatch must catch the failure, transition to a blocked state (via `handle_event` with `succeeded=False`), write the final state, and complete the RunRecord as `failed` or `timed_out`.
- **Crash during commit**: restart marks the `running` RunRecord as `interrupted` but **does not alter state**. The state remains in the intermediate state. Recovery happens via Phase 7's recovery UI.

## Required Changes From Review

| # | Required Change | How Addressed |
|---|---|---|
| 1 | Contract-driven template discovery, not inline maps | `ContextService` loads `workflow-contract.json` at runtime. Templates discovered via filesystem glob from adapter config. `string.Template.safe_substitute()` used for variable substitution. |
| 2 | Persist actual workflow artifact, not just run wrapper | Add result interpretation step: map adapter_action → expected stage artifact (e.g., `master-plan.json`), validate output, atomic write via `FileStore`. |
| 3 | Structured output-file protocol | Adapter generates unique `$output_path`, injected into template context. Template writes structured result there. Adapter reads/validates after execution; stdout is fallback diagnostic. |
| 4 | Atomic dispatch: preflight before commit | Split into preflight (validate, context, RunRecord lock, metadata) and commit (state write, adapter, artifact, completion). No state mutation before RunRecord creation. |
| 5 | No auto-rewind on restart | Lifespan handler only calls `interrupt_running_runs()`. Never infers or writes predecessor state. |
| 6 | Repair retry semantics | Select latest **terminal** run (failed/timed_out/interrupted). Re-check confirmation. Create new RunRecord. Validate action is stage-valid from current blocked state. Preserve old record. |
| 7 | Preserve `timed_out` as distinct status | `AdapterResult` gains `outcome: str` field (`succeeded`/`failed`/`timed_out`). RunRecord completion uses it directly. |
| 8 | Record full RunRecord metadata | `template_version`, `working_directory`, `input_artifact_refs`, `command_context_hash` all captured during preflight before execution. |
| — | Confirmation response code | Use `200` with `"status": "needs_approval"` per master plan contract, not `400`. |
| — | Test injection seam | Use `set_default_adapter()` module-level function on `ActionService` + fixture that calls it, plus `app.dependency_overrides` for the production path. |

## Implementation Tasks

### 3.1 — Adapter base interface and OpenCode adapter

**Files:**
- `services/orchestrator/adapters/__init__.py` — package init (empty)
- `services/orchestrator/adapters/base.py` — `ExecutionAdapter` abstract base
- `services/orchestrator/adapters/opencode.py` — `OpenCodeAdapter`

**`base.py`:**

```python
from abc import ABC, abstractmethod
from services.orchestrator.schemas.adapter import AdapterResult

class ExecutionAdapter(ABC):
    @abstractmethod
    async def execute(
        self,
        action: str,
        context_bundle: dict[str, str],
        run_id: str,
        working_dir: str,
        timeout: int,
        output_path: str,  # structured output file path (new)
    ) -> AdapterResult:
        ...
```

**`AdapterResult` schema update** (`services/orchestrator/schemas/adapter.py`):

```python
class AdapterResult(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    success: bool
    outcome: str = "succeeded"  # "succeeded" | "failed" | "timed_out"
    output_text: str
    artifact_path: Optional[str] = None
    suggested_next_action: Optional[str] = None
```

**`opencode.py`:**

- Constructor loads `config/adapters/opencode.json` to get template→timeout mapping.
- `execute()` method:
  1. Look up `action` in the loaded adapter config to get `template` filename and `timeout_seconds`.
  2. Discover template via filesystem: `Path(working_dir) / "adapters" / "commands" / template`. Test that the file exists.
  3. Read template file. Use `string.Template.safe_substitute()` to replace `$variable` references. The context bundle already includes `$output_path` (set by the action service).
     - Unlike regex substitution, `string.Template` uses `$variable` or `${variable}` syntax.
     - `safe_substitute()` leaves missing variables in place (no KeyError).
     - Valid variable names match `[a-zA-Z_][a-zA-Z0-9_]*`.
  4. Write rendered prompt to `.flowbench/runs/<run-id>/prompt.md` (use `FileStore._validate_path` or direct `os.makedirs`).
  5. Execute via `asyncio.create_subprocess_exec`:
     ```python
     proc = await asyncio.create_subprocess_exec(
         "opencode", "run", str(prompt_path),
         stdout=asyncio.subprocess.PIPE,
         stderr=asyncio.subprocess.PIPE,
         cwd=working_dir,
     )
     try:
         stdout, stderr = await asyncio.wait_for(
             proc.communicate(), timeout=timeout_seconds
         )
     except asyncio.TimeoutError:
         proc.kill()
         await proc.wait()
         return AdapterResult(
             success=False,
             outcome="timed_out",
             output_text=f"Timed out after {timeout_seconds}s",
         )
     ```
  6. After subprocess exits, read the output file at `output_path`:
     ```python
     output_file = Path(output_path)
     if output_file.exists():
         try:
             structured_result = json.loads(output_file.read_text())
             return AdapterResult(
                 success=True,
                 outcome="succeeded",
                 output_text=json.dumps(structured_result),
                 artifact_path=str(output_file),
             )
         except (json.JSONDecodeError, OSError):
             pass  # fall through to stdout fallback
     # Fallback: use stdout as diagnostic, mark failed
     return AdapterResult(
         success=False,
         outcome="failed" if proc.returncode != 0 else "succeeded",
         output_text=stdout.decode() if stdout else "",
         artifact_path=None,
     )
     ```
  7. Handle `FileNotFoundError` (opencode not installed) → return `AdapterResult(success=False, outcome="failed", output_text="opencode CLI not found on $PATH")`.
  8. Handle `asyncio.TimeoutError` → as shown above.

**Template file glob:** The adapter config (`config/adapters/opencode.json`) already specifies which template filename to use for each action. The adapter resolves it relative to `adapters/commands/`. No separate glob needed — the config IS the template index. For validation, a test should glob `adapters/commands/*.md` and verify all referenced templates exist.

**Acceptance:** `OpenCodeAdapter` renders a template via `string.Template`, writes prompt file, passes `$output_path`, attempts subprocess call, reads output file, falls back to stdout on missing output. Missing `opencode` CLI returns clear error. Timeout returns `outcome="timed_out"`.

---

### 3.2 — Command templates (10 Markdown files)

**Directory:** `adapters/commands/`

Each template is a plain Markdown system prompt using `string.Template`-compatible `$variable` syntax. Every template receives `$output_path` injected by the action service — the template must instruct the agent to write its structured result to that path.

Variable names match the context bundle keys from `workflow-contract.json`'s `context_bundle_rules`.

| File | Used By | Variables |
|---|---|---|
| `audit-existing-app.md` | `load_existing_project` | `$repo_path`, `$output_path` |
| `generate-master-plan.md` | `generate_master_plan`, `refine_plan` | `$scope`, `$existing_app_audit`, `$output_path` |
| `sharpen-plan.md` | `sharpen_plan`, `sharpen_phase_plan` | `$current_plan`, `$scope`, `$sharpening_history`, `$existing_app_audit`, `$output_path` |
| `generate-phase-plan.md` | `generate_phase_plan` | `$master_plan`, `$phase_definition`, `$prior_handoff`, `$existing_app_audit`, `$output_path` |
| `build-phase.md` | `start_building`, `build_phase`, `retry` | `$phase_plan`, `$phase_handoff`, `$master_plan_excerpt`, `$output_path` |
| `review-phase.md` | `review_phase` | `$phase_plan`, `$build_summary`, `$output_path` |
| `test-phase.md` | `test_phase` | `$phase_plan`, `$build_summary`, `$review_findings`, `$output_path` |
| `fix-findings.md` | `fix_findings`, `fix_failures` | `$findings_or_failures`, `$phase_plan`, `$latest_build_summary`, `$output_path` |
| `generate-handoff.md` | `generate_handoff` | `$phase_plan`, `$build_summary`, `$review_findings`, `$test_results`, `$unresolved_issues`, `$next_phase_name`, `$output_path` |
| `summarize-state.md` | `ask_for_summary`, `summarize_state` | `$output_path` |

Each template must contain an instruction like:
```
Write your complete structured output to $output_path as a JSON file.
```

**Acceptance:** 10 `.md` files exist. A test globs `adapters/commands/*.md`, renders each with dummy variables via `string.Template.safe_substitute()`, verifies no substitution errors. Another test verifies all templates referenced by `config/adapters/opencode.json` exist on disk.

---

### 3.3 — Context bundle assembly (contract-driven)

**File:** `services/orchestrator/services/context_service.py`

**Design principle:** All adapter_action mapping and context bundle rules are loaded from `workflow-contract.json` at runtime. No hardcoded dicts.

```python
import json
from pathlib import Path
from services.orchestrator.store.file_store import FileStore
from services.orchestrator.schemas.state import CurrentState


class ContextService:
    def __init__(self, repo_path: str, store: FileStore):
        self.repo_path = repo_path
        self.store = store
        self.contract = self._load_contract()
        self.adapter_config = self._load_adapter_config()

    def _load_contract(self) -> dict:
        path = Path(__file__).parents[3] / "workflow-contract.json"
        with open(path) as f:
            return json.load(f)

    def _load_adapter_config(self) -> dict:
        path = Path(__file__).parents[3] / "config" / "adapters" / "opencode.json"
        with open(path) as f:
            return json.load(f)

    def get_adapter_action(self, action: str) -> str | None:
        """Resolve the adapter_action name for a workflow action from the contract."""
        for state_def in self._all_states():
            for a_name, a_def in state_def.get("actions", {}).items():
                if a_name == action:
                    return a_def.get("adapter_action")
        return None

    def _all_states(self) -> list[dict]:
        machines = self.contract.get("states", {})
        # The contract has a flat "states" dict at top level
        if machines:
            return list(machines.values())
        return []

    def get_context_rules(self, adapter_action: str) -> dict | None:
        """Get required/optional context rules for an adapter_action from the contract."""
        rules = self.contract.get("context_bundle_rules", {}).get("rules", [])
        for rule in rules:
            if rule.get("adapter_action") == adapter_action:
                return {
                    "required": rule.get("required_context", []),
                    "optional": rule.get("optional_context", []),
                    "assembly_note": rule.get("assembly_note", ""),
                }
        return None

    def assemble(self, action: str, state: CurrentState) -> dict[str, str]:
        """Assemble the context bundle for a workflow action."""
        adapter_action = self.get_adapter_action(action)
        if adapter_action is None:
            raise ValueError(f"Cannot resolve adapter_action for workflow action '{action}'")

        rules = self.get_context_rules(adapter_action)
        if rules is None:
            raise ValueError(
                f"No context bundle rules for adapter_action '{adapter_action}' "
                f"(resolved from action '{action}')"
            )

        bundle: dict[str, str] = {}
        for key in rules["required"]:
            value = self._resolve_context_key(key, state)
            if value is None:
                raise ValueError(
                    f"Required context key '{key}' could not be resolved "
                    f"for action '{action}' (adapter_action '{adapter_action}')"
                )
            bundle[key] = value
        for key in rules["optional"]:
            value = self._resolve_context_key(key, state)
            if value is not None:
                bundle[key] = value
        return bundle

    def resolve_for_retry(
        self, last_run_action: str, state: CurrentState
    ) -> dict[str, str]:
        """Resolve the context bundle for a retry based on the original action."""
        return self.assemble(last_run_action, state)
```

**`_resolve_context_key()` artifact resolution table:**

| Context Key | Resolution |
|---|---|
| `scope` | `store.read_json("scope.json")` → JSON-dumped |
| `repo_path` | `state.repo_path` (string, not JSON) |
| `existing_app_audit` | `store.read_json("audit.json")` → JSON-dumped |
| `current_plan` | If `state.current_phase_state`: `phase-plan-{phase_id}.json`; else: `master-plan.json` |
| `master_plan` | `store.read_json("master-plan.json")` → JSON-dumped |
| `phase_definition` | Phase queue item matching `current_phase_id` → JSON-dumped |
| `phase_plan` | `store.read_json(f"phase-plan-{state.current_phase_id}.json")` |
| `phase_handoff` | `store.read_json(f"handoff-{state.current_phase_id}.json")` |
| `build_summary` / `latest_build_summary` | `store.read_json(f"build-summary-{state.current_phase_id}.json")` |
| `review_findings` | `store.read_json(f"review-findings-{state.current_phase_id}.json")` |
| `test_results` | `store.read_json(f"test-results-{state.current_phase_id}.json")` |
| `findings_or_failures` | Try `review-findings-{phase_id}.json` first, then `test-results-{phase_id}.json` |
| `sharpening_history` | `store.read_json("sharpening-notes.json")` |
| `master_plan_excerpt` | `store.read_json("master-plan.json")` (full content for Phase 3) |
| `prior_handoff` | `store.read_json(f"handoff-{prev_phase_id}.json")` |
| `unresolved_issues` | (not resolved in Phase 3 — optional) |
| `next_phase_name` | (not resolved in Phase 3 — optional) |

All JSON values are dumped as compact JSON strings via `json.dumps(value, default=str)`.

The `$output_path` variable is NOT assembled here — it is injected by `ActionService` after context assembly because it depends on the run_id (which doesn't exist until the RunRecord is created).

**Acceptance:** `assemble("generate_master_plan", state)` loads `workflow-contract.json`, resolves `adapter_action: "generate_master_plan"`, applies context rules, and returns `{"scope": "<content>"}`. Missing required file raises `ValueError` with the action name in the message.

---

### 3.4 — Full dispatch pipeline (preflight/commit)

**Files:**
- `services/orchestrator/services/action_service.py` — new dispatch orchestration
- `services/orchestrator/api/actions.py` — replace adapter stub, add `confirmed` to `ActionRequest`, add system action confirmation

**`ActionService` class:**

```python
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from services.orchestrator.store.file_store import FileStore
from services.orchestrator.store.event_log import EventLog
from services.orchestrator.store.run_store import RunStore
from services.orchestrator.services.context_service import ContextService
from services.orchestrator.adapters.base import ExecutionAdapter
from services.orchestrator.adapters.opencode import OpenCodeAdapter
from services.orchestrator.schemas.run_record import RunRecord
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.schemas.state import CurrentState


# Default adapter for production (overridable in tests)
_default_adapter: Optional[ExecutionAdapter] = None


def set_default_adapter(adapter: Optional[ExecutionAdapter]) -> None:
    global _default_adapter
    _default_adapter = adapter


def get_default_adapter() -> ExecutionAdapter:
    global _default_adapter
    if _default_adapter is None:
        _default_adapter = OpenCodeAdapter()
    return _default_adapter


class ActionService:
    def __init__(self, repo_path: str = "."):
        self.repo_path = repo_path
        self.store = FileStore(repo_path)
        self.event_log = EventLog(repo_path)
        self.run_store = RunStore(repo_path)
        self.context_service = ContextService(repo_path, self.store)
        self.adapter = get_default_adapter()
```

**Preflight / commit dispatch (pseudocode):**

```python
async def dispatch_adapter_action(self, action, body, config, actions_config):
    # ── PREFLIGHT: no state mutation ──────────────────────────────

    # 1. Validate action
    action_entry = actions_config.get(action)
    if action_entry is None:
        return JSONResponse(status_code=400, content=ErrorResponse(...).model_dump())

    # 2. Confirmation check
    risk_cat = action_entry.get("risk_category")
    if risk_cat and self._requires_confirmation(risk_cat):
        if not (body and body.confirmed):
            return {
                "status": "needs_approval",
                "message": f"This action requires confirmation ({risk_cat}).",
                "risk_category": risk_cat,
                "action": action,
                "state_unchanged": True,
            }

    # 3. Load state
    state_data = self.store.read_json("current-state.json")
    if state_data is None:
        return JSONResponse(status_code=400, content=ErrorResponse(...).model_dump())
    current_state = CurrentState(**state_data)

    # 4. Determine machine
    if current_state.current_phase_state:
        machine = create_phase_machine(config)
        level, current = "phase", current_state.current_phase_state
    else:
        machine = create_project_machine(config)
        level, current = "project", current_state.project_state

    guards = GUARD_MAP

    # 5. Transition or retry
    if action == "retry":
        # 5a. Find latest terminal run for this workflow level
        runs = self.run_store.get_all_runs()
        last_run = next(
            (r for r in runs if r.status in ("failed", "timed_out", "cancelled", "interrupted")),
            None,
        )
        if last_run is None:
            return JSONResponse(status_code=400, content={"status": "no_run_to_retry", ...})
        retry_action = last_run.action

        # 5b. Re-check confirmation for the original action's risk category
        original_entry = actions_config.get(retry_action, {})
        orig_risk = original_entry.get("risk_category")
        if orig_risk and self._requires_confirmation(orig_risk):
            if not (body and body.confirmed):
                return {"status": "needs_approval", ...}

        # 5c. Validate retry action is stage-valid from current state
        try:
            intermediate_state_for_retry, _ = machine.transition(
                current, retry_action, guards, self._build_guard_context()
            )
        except StateTransitionError as e:
            return JSONResponse(status_code=400, content=ErrorResponse(message=str(e)).model_dump())

        # Use the resolved action for the rest of dispatch
        resolved_action = retry_action
        # Don't write state yet — preflight not complete
    else:
        # 5d. First transition (don't write state)
        try:
            intermediate_state, started_events = machine.transition(
                current, action, guards, self._build_guard_context()
            )
        except StateTransitionError as e:
            return JSONResponse(status_code=400, content=ErrorResponse(...).model_dump())
        resolved_action = action

    # 6. Assemble context bundle
    try:
        context_bundle = self.context_service.assemble(resolved_action, current_state)
    except ValueError as e:
        return JSONResponse(status_code=400, content=ErrorResponse(message=str(e)).model_dump())

    # 7. Create RunRecord (acquires active-run lock)
    try:
        run = self.run_store.create_run(
            resolved_action, phase_id=current_state.current_phase_id
        )
    except RuntimeError as e:
        return JSONResponse(status_code=409, content={"status": "active_run_exists", ...})

    # 8. Record RunRecord metadata
    template_name = self._get_template_name(resolved_action)
    template_path = Path(self.repo_path) / "adapters" / "commands" / template_name
    template_version = self._hash_file(template_path) if template_path.exists() else None

    # Build input_artifact_refs from context bundle keys → file paths
    artifact_refs = self._build_artifact_refs(resolved_action, current_state)

    # Compute context hash
    context_hash = self.run_store.compute_context_hash(context_bundle)

    # Update RunRecord with metadata
    run.template_version = template_version
    run.working_directory = str(Path(self.repo_path).resolve())
    run.input_artifact_refs = artifact_refs
    run.command_context_hash = context_hash
    self.run_store._persist(run)

    # 9. Start run
    self.run_store.start_run(run.run_id)

    # ── COMMIT: state mutation begins ────────────────────────────

    # 10. Write intermediate state + log started events
    if action == "retry":
        # For retry, use the intermediate state from the re-validated transition
        current_state.current_phase_state = intermediate_state_for_retry \
            if level == "phase" else None
        current_state.project_state = intermediate_state_for_retry \
            if level == "project" else intermediate_state_for_retry
        # ... set the state properly
    else:
        if level == "project":
            current_state.project_state = intermediate_state
            if intermediate_state in ("scope_ready", "master_plan_sharpening",
                                      "project_complete", "phase_queue_ready"):
                current_state.current_phase_id = None
                current_state.current_phase_state = None
        else:
            current_state.current_phase_state = intermediate_state
    current_state.updated_at = datetime.now(timezone.utc)
    self.store.write_json("current-state.json", json.loads(current_state.model_dump_json()))

    for evt in started_events if action != "retry" else []:
        self.event_log.append(self._make_event(evt, resolved_action, current_state, level))

    # 11. Execute adapter
    adapter_config_entry = self._get_adapter_config(resolved_action)
    timeout = adapter_config_entry.get("timeout_seconds", 120)
    output_path = str(
        Path(self.repo_path) / ".flowbench" / "runs" / run.run_id / "output.json"
    )

    # Inject $output_path into context bundle
    context_bundle["output_path"] = output_path

    try:
        result = await self.adapter.execute(
            action=resolved_action,
            context_bundle=context_bundle,
            run_id=run.run_id,
            working_dir=self.repo_path,
            timeout=timeout,
            output_path=output_path,
        )
    except Exception as e:
        result = AdapterResult(success=False, outcome="failed", output_text=str(e))

    # 12. Interpret result → write stage artifact
    if result.success:
        artifact_filename = self._map_adapter_action_to_artifact(
            resolved_action, current_state
        )
        if artifact_filename:
            # Validate and write the stage artifact
            try:
                output_data = json.loads(result.output_text)
                if not isinstance(output_data, dict):
                    raise ValueError("Adapter output is not a JSON object")
                self.store.write_json(artifact_filename, output_data)
            except (json.JSONDecodeError, ValueError, OSError) as e:
                # Output is malformed — mark as failure, preserve diagnostic
                result = AdapterResult(
                    success=False,
                    outcome="failed",
                    output_text=f"Adapter returned invalid output: {e}\n{result.output_text}",
                )

    # 13. Determine two-phase vs single-phase
    if action == "retry":
        # For retry, the current state IS the intermediate state
        effective_intermediate = intermediate_state_for_retry
    else:
        effective_intermediate = intermediate_state

    intermediate_config = machine.transitions.get(effective_intermediate, {})
    has_completion_events = bool(intermediate_config.get("events", {}))

    if has_completion_events:
        event_key = self._find_completion_event_key(intermediate_config, result.success)
        final_state, completion_events = machine.handle_event(
            effective_intermediate, event_key, result.success, guards, {}
        )
    else:
        final_state = effective_intermediate
        completion_events = []

    # 14. Write final state + log completion events
    if level == "project":
        current_state.project_state = final_state
        if final_state in ("scope_ready", "master_plan_sharpening",
                          "project_complete", "phase_queue_ready"):
            current_state.current_phase_id = None
            current_state.current_phase_state = None
    else:
        current_state.current_phase_state = final_state
    current_state.updated_at = datetime.now(timezone.utc)
    self.store.write_json("current-state.json", json.loads(current_state.model_dump_json()))

    for evt in completion_events:
        self.event_log.append(self._make_event(evt, resolved_action, current_state, level))

    # 15. Complete RunRecord
    self.run_store.complete_run(
        run_id=run.run_id,
        status=result.outcome,  # "succeeded", "failed", or "timed_out"
        output_artifact_path=result.artifact_path,
        failure_message=None if result.success else result.output_text[:2000],
    )

    # 16. Return
    label = _resolve_label(resolved_action, action_entry)
    return {
        "status": "ok" if result.success else "failed",
        "outcome": result.outcome,
        "new_state": final_state,
        "message": f"{'Completed' if result.success else 'Failed'}: {label}.",
        "run_id": run.run_id,
    }
```

**Helper methods:**

```python
def _requires_confirmation(self, risk_category: str) -> bool:
    policies_path = Path(__file__).parents[3] / "config" / "policies.json"
    with open(policies_path) as f:
        policies = json.load(f)
    cat = policies.get("risk_categories", {}).get(risk_category, {})
    return cat.get("requires_confirmation", False)

def _find_completion_event_key(self, state_config: dict, success: bool) -> str:
    events = state_config.get("events", {})
    if success:
        for key in events:
            if key.endswith("_complete") or key.endswith("_passed"):
                return key
    else:
        for key in events:
            if key.endswith("_failed"):
                return key
    return next(iter(events.keys()))

def _get_template_name(self, action: str) -> str:
    config = self.context_service._load_adapter_config()
    return config.get("methods", {}).get(action, {}).get("template", "")

def _get_adapter_config(self, action: str) -> dict:
    config = self.context_service._load_adapter_config()
    return config.get("methods", {}).get(action, {"timeout_seconds": 120})

def _hash_file(self, path: Path) -> str | None:
    import hashlib
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    except OSError:
        return None

def _build_artifact_refs(self, action: str, state: CurrentState) -> dict[str, str]:
    """Build a dict of context key → artifact file path for this action."""
    adapter_action = self.context_service.get_adapter_action(action)
    rules = self.context_service.get_context_rules(adapter_action)
    refs = {}
    for key in (rules.get("required", []) + rules.get("optional", [])):
        path = self._resolve_artifact_path(key, state)
        if path:
            refs[key] = str(path.relative_to(Path(self.repo_path) / ".flowbench"))
    return refs

def _resolve_artifact_path(self, key: str, state: CurrentState) -> Path | None:
    """Resolve a context key to its .flowbench artifact path."""
    base = Path(self.repo_path) / ".flowbench"
    phase_id = state.current_phase_id
    mapping = {
        "scope": base / "scope.json",
        "current_plan": base / (f"phase-plan-{phase_id}.json" if phase_id else "master-plan.json"),
        "master_plan": base / "master-plan.json",
        "phase_plan": base / f"phase-plan-{phase_id}.json" if phase_id else None,
        "build_summary": base / f"build-summary-{phase_id}.json" if phase_id else None,
        "latest_build_summary": base / f"build-summary-{phase_id}.json" if phase_id else None,
        "review_findings": base / f"review-findings-{phase_id}.json" if phase_id else None,
        "findings_or_failures": base / f"review-findings-{phase_id}.json" if phase_id else None,
        "test_results": base / f"test-results-{phase_id}.json" if phase_id else None,
        "existing_app_audit": base / "audit.json",
        "sharpening_history": base / "sharpening-notes.json",
        "phase_handoff": base / f"handoff-{phase_id}.json" if phase_id else None,
        "master_plan_excerpt": base / "master-plan.json",
        "prior_handoff": None,  # needs prev phase ID
        "unresolved_issues": None,
        "next_phase_name": None,
    }
    result = mapping.get(key)
    if result and result.exists():
        return result
    return None

def _map_adapter_action_to_artifact(
    self, action: str, state: CurrentState
) -> str | None:
    """Map a resolved workflow action to its expected artifact filename."""
    phase_id = state.current_phase_id or "{phase_id}"
    phase_suffix = f"-{phase_id}" if state.current_phase_id else ""
    mapping = {
        "generate_master_plan": "master-plan.json",
        "refine_plan": "master-plan.json",
        "sharpen_plan": "sharpening-notes.json",
        "sharpen_phase_plan": "sharpening-notes.json",
        "generate_phase_plan": f"phase-plan{phase_suffix}.json",
        "start_building": f"build-summary{phase_suffix}.json",
        "build_phase": f"build-summary{phase_suffix}.json",
        "review_phase": f"review-findings{phase_suffix}.json",
        "test_phase": f"test-results{phase_suffix}.json",
        "fix_findings": f"review-findings{phase_suffix}.json",
        "fix_failures": f"test-results{phase_suffix}.json",
        "generate_handoff": f"handoff{phase_suffix}.json",
        "audit_existing_app": "audit.json",
        "load_existing_project": "audit.json",
        "summarize_state": None,
        "ask_for_summary": None,
    }
    return mapping.get(action)

def _build_guard_context(self) -> dict:
    context = {}
    try:
        scope_data = self.store.read_json("scope.json")
        if scope_data:
            context["scope"] = scope_data.get("content", "")
    except ValueError:
        pass
    try:
        phase_queue = self.store.read_json("phase-queue.json")
        if phase_queue:
            context["phase_queue"] = phase_queue
    except ValueError:
        pass
    return context

def _make_event(self, evt, action, state, level) -> dict:
    from services.orchestrator.engine.state_machine import _resolve_label
    return {
        "schema_version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": level,
        "event": evt["event"],
        "from_state": evt["from_state"],
        "to_state": evt["to_state"],
        "actor": "builder",
        "description": _resolve_label(action, None),
        "phase_id": state.current_phase_id,
        "artifact_type": None,
    }
```

**`actions.py` modifications:**

1. Add `confirmed: bool = False` to `ActionRequest`:
   ```python
   class ActionRequest(BaseModel):
       scope_content: Optional[str] = None
       repo_path: Optional[str] = None
       confirmed: bool = False
   ```

2. Add confirmation check for system actions before the transition:
   ```python
   # Confirmation gate (applies to both system and adapter actions)
   risk_category = action_entry.get("risk_category")
   if risk_category:
       policies_path = Path(__file__).parents[3] / "config" / "policies.json"
       with open(policies_path) as f:
           policies = json.load(f)
       cat = policies.get("risk_categories", {}).get(risk_category, {})
       if cat.get("requires_confirmation") and not (body and body.confirmed):
           return {
               "status": "needs_approval",
               "message": f"This action requires confirmation ({risk_category}).",
               "risk_category": risk_category,
               "action": action,
               "state_unchanged": True,
           }
   ```

3. Replace the adapter stub:
   ```python
   if action_type == "adapter":
       from services.orchestrator.services.action_service import ActionService
       service = ActionService(".")
       return await service.dispatch_adapter_action(action, body, config, actions_config)
   ```

**Acceptance:** Full preflight/commit pipeline runs end-to-end. Confirmation returns `needs_approval`. RunRecord created before state write. Stage artifact written and validated. `timed_out` and `failed` outcomes preserved. All metadata recorded on RunRecord.

---

### 3.5 — Confirmation enforcement

**Response contract:** Returns HTTP 200 with `"status": "needs_approval"` (not 400). This matches the master plan's API contract and allows the UI to handle it as a normal response with a clear status field, not as an error.

Response body:
```json
{
    "status": "needs_approval",
    "message": "This action requires confirmation (modify_files).",
    "risk_category": "modify_files",
    "action": "start_building",
    "state_unchanged": true
}
```

Applied to:
- All adapter actions with `risk_category` set (e.g., `start_building`, `fix_findings`, `fix_failures`)
- All system actions with `risk_category` set (e.g., `cancel_project`, `abandon_phase`)

**Frontend note:** Already sends `confirmed: true` on approve from the risk dialog (Phase 2). The frontend needs no change — it already checks `status` field on responses. The response status `"needs_approval"` is new but is a pass-through (the frontend doesn't currently handle it specially since Phase 2's backend never returned it). The frontend should handle it by showing the risk dialog again (same as `adapter_not_available` — show toast with message). This is acceptable for Phase 3.

**Acceptance:** `POST /actions/start_building` without `confirmed: true` returns `{"status": "needs_approval", "state_unchanged": true}` with HTTP 200. Same call with `confirmed: true` proceeds to dispatch. Same for `cancel_project`.

---

### 3.6 — `workflows.json` modifications for `retry`

**File:** `config/workflows.json`

Add `retry` to `project_blocked`:

```json
"project_blocked": {
  "actions": {
    "retry": {
      "target_state": "project_blocked",
      "action_type": "adapter",
      "guard": null,
      "event": "project_retried"
    },
    ...existing actions...
  },
  "events": {}
}
```

The `target_state: "project_blocked"` is a self-transition. The dispatch pipeline re-validates the transition for the underlying action (e.g., `generate_master_plan`) which targets the intermediate state. This entry exists solely to make `retry` a valid action in the state machine.

**Acceptance:** `GET /api/v1/actions` returns `retry` when state is `project_blocked` or `phase_blocked`.

---

### 3.7 — Lifespan handler (no state rewind)

**File:** `services/orchestrator/main.py`

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    from services.orchestrator.store.run_store import RunStore
    store = RunStore(".")
    interrupted = store.interrupt_running_runs()
    # Do NOT rewrite state. The state is the authoritative snapshot.
    # Recovery is handled in Phase 7 via the recovery UI.
    yield
```

No predecessor-state inference. No `current-state.json` writes. The state stays exactly as it was when the crash occurred. `interrupt_running_runs()` marks any `running` RunRecords as `interrupted` with a recovery message.

**Acceptance:** After simulated crash during `master_plan_drafting`, restart leaves state as `master_plan_drafting`. RunRecord is `interrupted`. No `current-state.json` modification.

---

### 3.8 — Tests

**Files:**
- `services/orchestrator/tests/test_api.py` — modified
- `services/orchestrator/tests/test_adapters.py` — new
- `services/orchestrator/tests/conftest.py` — modified

**MockAdapter fixture (revised injection approach):**

```python
# In conftest.py or test file
@pytest.fixture(autouse=True)
def mock_adapter():
    class MockAdapter(ExecutionAdapter):
        def __init__(self):
            self.calls = []
            self.result = AdapterResult(
                success=True, outcome="succeeded", output_text='{"status": "ok"}'
            )
            self.timeout_result = AdapterResult(
                success=False, outcome="timed_out", output_text="timed out"
            )

        async def execute(self, action, context_bundle, run_id, working_dir, timeout, output_path):
            self.calls.append({
                "action": action,
                "context_keys": list(context_bundle.keys()),
                "run_id": run_id,
                "output_path": output_path,
                "timeout": timeout,
            })
            # Write a valid output file if output_path is provided
            if output_path:
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                Path(output_path).write_text(self.result.output_text)
            return self.result

    from services.orchestrator.services import action_service
    adapter = MockAdapter()
    action_service.set_default_adapter(adapter)
    yield adapter
    action_service.set_default_adapter(None)  # clean up
```

**Existing test modifications:**

| Existing Test | Change |
|---|---|
| `test_adapter_action_returns_unavailable` | Rewrite: set up scope.json, POST `generate_master_plan` without confirmed → `{"status": "needs_approval"}` |
| `test_adapter_action_no_event` | Rewrite: POST with confirmed → verify events ARE created |
| `test_adapter_action_no_runrecord` | Rewrite: POST with confirmed → verify RunRecord IS created |

**New test classes:**

```python
class TestSystemConfirmation:
    def test_cancel_project_no_confirm(self):
        POST /actions/cancel_project → 200 {"status": "needs_approval"}

    def test_cancel_project_with_confirm(self):
        POST /actions/cancel_project?confirmed=true → 200 {"status": "ok"}


class TestAdapterDispatch:
    def test_dispatch_creates_runrecord(self, mock_adapter):
        POST generate_master_plan with confirm → RunRecord in .flowbench/runs/

    def test_dispatch_transitions_state(self, mock_adapter):
        POST → state changes: scope_ready → master_plan_drafting → master_plan_sharpening

    def test_dispatch_logs_events(self, mock_adapter):
        POST → events.ndjson has "master_plan_generation_started" and "draft_complete"

    def test_dispatch_writes_stage_artifact(self, mock_adapter):
        POST → master-plan.json created in .flowbench/ with validated content

    def test_dispatch_failure_no_artifact(self, mock_adapter):
        mock_adapter.result = AdapterResult(success=False, outcome="failed", ...)
        POST → state ends in project_blocked, no master-plan.json written

    def test_dispatch_malformed_output(self, mock_adapter):
        mock_adapter.result = AdapterResult(success=True, outcome="succeeded",
                                             output_text="not json")
        POST → marked as failed, preserved diagnostic in failure_message

    def test_active_run_rejected(self, mock_adapter):
        First dispatch starts, second dispatch → 409 active_run_exists

    def test_dispatch_single_phase_adapter(self, mock_adapter):
        sharpen_plan (self-transition) → state stays in master_plan_sharpening, no completion event

    def test_preflight_failure_no_mutation(self):
        Missing required context file → 400 error, state unchanged, no events, no RunRecord


class TestTimeout:
    def test_timeout_yields_timedout(self, mock_adapter):
        mock_adapter.result = mock_adapter.timeout_result
        POST → RunRecord.status == "timed_out"

    def test_nonzero_exit_yields_failed(self, mock_adapter):
        mock_adapter.result = AdapterResult(success=False, outcome="failed", ...)
        POST → RunRecord.status == "failed"


class TestRetry:
    def test_retry_no_terminal_run(self):
        POST /actions/retry with no prior failed run → 400 no_run_to_retry

    def test_retry_after_failure(self, mock_adapter):
        Create a failed run for generate_master_plan (state: project_blocked)
        POST retry with confirmed → new RunRecord created, same action dispatched

    def test_retry_creates_new_runrecord(self, mock_adapter):
        POST retry → new run_id in response, old RunRecord unchanged

    def test_retry_requires_confirmation_for_risky_action(self, mock_adapter):
        Prior run was start_building (modify_files), current state: phase_blocked
        POST retry without confirmed → 200 needs_approval

    def test_retry_preserves_prior_record(self, mock_adapter):
        Prior run has failure_message. POST retry → old record unmodified.


class TestContextService:
    def test_assemble_from_contract(self, temp_repo):
        scope.json present → returns {"scope": "..."}
        Asserts that workflow-contract.json was loaded, not inline dict

    def test_assemble_missing_required(self, temp_repo):
        scope.json missing → raises ValueError with action name

    def test_assemble_unknown_action(self, temp_repo):
        Unknown action → raises ValueError


class TestOpenCodeAdapter:
    def test_template_safe_substitute(self, tmp_path):
        Template with $scope → rendered, missing $unused → left as-is

    def test_output_file_protocol(self, tmp_path):
        Adapter runs, writes output to $output_path, reads it back

    def test_missing_output_file_fallback(self, tmp_path):
        Output file not created → falls back to stdout, success depends on exit code

    def test_missing_opencode_cli(self, tmp_path):
        opencode not on PATH → AdapterResult(success=False, outcome="failed")

    def test_timeout_returns_timedout(self, tmp_path):
        Subprocess that sleeps → timeout → AdapterResult(success=False, outcome="timed_out")


class TestTemplateDiscovery:
    def test_all_templates_exist(self):
        Every template referenced in config/adapters/opencode.json exists in adapters/commands/

    def test_templates_use_valid_string_template_syntax(self):
        Each template renders without error via string.Template.safe_substitute()


class TestCrashRecovery:
    def test_restart_does_not_rewind_state(self):
        Setup: master_plan_drafting state with running RunRecord
        Simulate restart → RunRecord marked interrupted, state unchanged

    def test_no_auto_rerun_on_restart(self):
        Setup: project_blocked state
        Restart → state unchanged, no new RunRecord created


class TestExistingBehavior:
    def test_navigation_no_side_effects(self):
        POST /actions/view_summary → 200, no events, no RunRecord

    def test_system_action_no_adapter(self):
        POST /actions/edit_scope → 200, state transitions normally

    def test_state_refresh_after_action(self):
        POST → GET /state returns updated updated_at
```

**Acceptance:** All tests pass. `ruff` clean. No tests require real `opencode` CLI.

---

## File Summary

| Path | Type | Task |
|---|---|---|
| `services/orchestrator/adapters/__init__.py` | Create | Empty package init |
| `services/orchestrator/adapters/base.py` | Create | `ExecutionAdapter` abstract base |
| `services/orchestrator/adapters/opencode.py` | Create | `OpenCodeAdapter` with output-file protocol, `string.Template`, timed_out distinction |
| `services/orchestrator/schemas/adapter.py` | Modify | Add `outcome: str` field |
| `services/orchestrator/services/context_service.py` | Create | Contract-driven context assembly (loads `workflow-contract.json`) |
| `services/orchestrator/services/action_service.py` | Create | Preflight/commit dispatch pipeline |
| `services/orchestrator/api/actions.py` | Modify | Adapter stub → dispatch call, `confirmed` field, system action confirmation, `needs_approval` response |
| `services/orchestrator/main.py` | Modify | Lifespan: only `interrupt_running_runs()`, no state rewind |
| `config/workflows.json` | Modify | Add `retry` action to `project_blocked` |
| `adapters/commands/audit-existing-app.md` | Create | Template with `$output_path` |
| `adapters/commands/generate-master-plan.md` | Create | Template with `$output_path` |
| `adapters/commands/sharpen-plan.md` | Create | Template with `$output_path` |
| `adapters/commands/generate-phase-plan.md` | Create | Template with `$output_path` |
| `adapters/commands/build-phase.md` | Create | Template with `$output_path` |
| `adapters/commands/review-phase.md` | Create | Template with `$output_path` |
| `adapters/commands/test-phase.md` | Create | Template with `$output_path` |
| `adapters/commands/fix-findings.md` | Create | Template with `$output_path` |
| `adapters/commands/generate-handoff.md` | Create | Template with `$output_path` |
| `adapters/commands/summarize-state.md` | Create | Template with `$output_path` |
| `services/orchestrator/tests/conftest.py` | Modify | Add `mock_adapter` fixture using `set_default_adapter()` |
| `services/orchestrator/tests/test_api.py` | Modify | Rewrite 3 adapter tests, add 15+ new tests |
| `services/orchestrator/tests/test_adapters.py` | Create | Adapter + context service + template discovery tests |

---

## Acceptance Checks

1. `POST /api/v1/actions/generate_master_plan` with project in `scope_ready` and `confirmed: true` → returns 200, creates RunRecord, writes `master-plan.json`, transitions through `master_plan_drafting` to `master_plan_sharpening`
2. `POST /api/v1/actions/start_building` without `confirmed: true` → returns 200 with `"status": "needs_approval"`, no state change, no RunRecord
3. `POST /api/v1/actions/cancel_project` without `confirmed: true` → `"status": "needs_approval"`
4. `POST /api/v1/actions/generate_master_plan` with adapter returning malformed output → marked as `failed`, preserved diagnostic message, no `master-plan.json` written
5. `POST /api/v1/actions/generate_master_plan` while another run is active → `409 active_run_exists`
6. Missing required context file (no `scope.json`) → 400 error, no state change, no RunRecord
7. `POST /api/v1/actions/retry` with prior failed terminal run → new RunRecord, same action dispatched, `confirmed` re-checked
8. `POST /api/v1/actions/retry` with no prior run → 400 `no_run_to_retry`
9. Timeout from adapter → RunRecord status is `timed_out`, not `failed`
10. `OpenCodeAdapter` uses `string.Template.safe_substitute()` and passes `$output_path` to the subprocess
11. `ContextService` loads `workflow-contract.json` at runtime — no hardcoded mapping dicts
12. All templates referenced by `config/adapters/opencode.json` exist on disk
13. After restart during `master_plan_drafting`, RunRecord is `interrupted`, state stays `master_plan_drafting` (no rewind)
14. Event log contains both "started" and completion events for two-phase adapter actions
15. `sharpen_plan` (single-phase) transitions to same state, no completion event
16. All existing system and navigation actions continue to work unchanged
17. `ruff` passes, all tests pass, no tests require real `opencode` CLI

---

## Implementation Order

1. **3.7** — Lifespan handler cleanup (trivial, no dependencies)
2. **3.3** — ContextService (no dependencies beyond stdlib + existing code)
3. **3.1** — Adapter base + `outcome` field + OpenCodeAdapter (depends on `AdapterResult` schema change)
4. **3.2** — Templates (independent, just files)
5. **3.5** — `confirmed` field + system action confirmation (small, prerequisite for dispatch)
6. **3.6** — `retry` in workflows.json (trivial modification)
7. **3.4** — ActionService + dispatch pipeline (depends on 3.1, 3.3, 3.5)
8. **3.8** — Tests (depends on all above)

---

## Estimated Effort

| Area | Files | Estimated Lines |
|---|---|---|
| Adapter base + OpenCodeAdapter | 4 files (1 schema modify) | ~160 |
| Context service | 1 file | ~120 |
| Action service (dispatch) | 1 file | ~300 |
| actions.py modifications | 1 file | ~70 |
| main.py cleanup | 1 file | ~15 |
| workflows.json modification | 1 file | ~10 |
| Templates (10 x ~18 lines) | 10 files | ~180 |
| Tests | 3 files (1 conftest modify) | ~380 |
| **Total** | **22 files** | **~1235** |

---

## Verification

```bash
# Lint
ruff check services/orchestrator/

# Run all tests
cd /Users/sameer/flow-bench/services/orchestrator
python -m pytest tests/ -v

# Manual smoke test (requires running backend + opencode CLI)
uvicorn services.orchestrator.main:app
curl -X POST http://127.0.0.1:8000/api/v1/actions/start_new_project
curl -X POST http://127.0.0.1:8000/api/v1/actions/edit_scope \
  -H "Content-Type: application/json" \
  -d '{"scope_content": "Build a task management app"}'
# Test needs_approval (no confirmed flag)
curl -X POST http://127.0.0.1:8000/api/v1/actions/start_building
# Test with confirmed flag
curl -X POST http://127.0.0.1:8000/api/v1/actions/generate_master_plan \
  -H "Content-Type: application/json" \
  -d '{"confirmed": true}'
```
