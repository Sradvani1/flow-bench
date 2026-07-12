import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi.responses import JSONResponse

from services.orchestrator.adapters.base import ExecutionAdapter
from services.orchestrator.engine.guards import (
    all_phases_complete,
    has_upcoming_phases,
    next_phase_exists,
    scope_has_content,
)
from services.orchestrator.engine.phase_machine import create_phase_machine
from services.orchestrator.engine.project_machine import create_project_machine
from services.orchestrator.engine.state_machine import (
    ACTION_LABELS,
    StateTransitionError,
)
from services.orchestrator.policies import requires_confirmation
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.schemas.errors import ErrorResponse
from services.orchestrator.schemas.state import CurrentState
from services.orchestrator.services.context_service import ContextService
from services.orchestrator.store.event_log import EventLog
from services.orchestrator.store.file_store import FileStore
from services.orchestrator.store.run_store import RunStore

_default_adapter: Optional[ExecutionAdapter] = None


def set_default_adapter(adapter: Optional[ExecutionAdapter]) -> None:
    global _default_adapter
    _default_adapter = adapter


def get_default_adapter() -> ExecutionAdapter | None:
    global _default_adapter
    if _default_adapter is None:
        return None
    return _default_adapter


GUARD_MAP = {
    "scope_has_content": scope_has_content,
    "next_phase_exists": next_phase_exists,
    "has_upcoming_phases": has_upcoming_phases,
    "all_phases_complete": all_phases_complete,
}


class ActionService:
    def __init__(self, repo_path: str = "."):
        self.repo_path = repo_path
        self.store = FileStore(repo_path)
        self.event_log = EventLog(repo_path)
        self.run_store = RunStore(repo_path)
        self.context_service = ContextService(repo_path, self.store)
        self.adapter = get_default_adapter()

    async def dispatch_adapter_action(
        self,
        action: str,
        body: Optional[dict],
        config: dict,
        actions_config: dict,
        adapter_action_override: str | None = None,
    ) -> dict | JSONResponse:
        # ── PREFLIGHT ──────────────────────────────────────────────

        # 1. Validate action entry
        action_entry = actions_config.get(action)
        if action_entry is None:
            return JSONResponse(
                status_code=400,
                content=ErrorResponse(
                    message=f"Unknown action '{action}'.",
                    suggested_action="Check the available actions and try again.",
                    error_code="UNKNOWN_ACTION",
                ).model_dump(),
            )

        # 2. Confirmation check (already done in actions.py for system actions,
        #    but adapter actions reach here without confirmation check)
        risk_cat = action_entry.get("risk_category")
        if risk_cat and requires_confirmation(risk_cat):
            confirmed = body.get("confirmed", False) if body else False
            if not confirmed:
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
            return JSONResponse(
                status_code=400,
                content=ErrorResponse(
                    message="No project is set up yet.",
                    suggested_action="Start a new project to begin.",
                    error_code="NO_PROJECT",
                ).model_dump(),
            )

        current_state = CurrentState(**state_data)

        # 4. Determine machine
        if current_state.current_phase_state:
            machine = create_phase_machine(config)
            level = "phase"
            current = current_state.current_phase_state
        else:
            machine = create_project_machine(config)
            level = "project"
            current = current_state.project_state

        # 5. Transition or retry
        resolved_action = action
        intermediate_state = None
        started_events = []

        guard_context = self._build_guard_context()

        if action == "retry":
            # 5a. Find latest terminal run for this workflow level
            runs = self.run_store.get_all_runs()
            last_run = None
            for r in runs:
                if r.status in ("failed", "timed_out", "interrupted"):
                    last_run = r
                    break

            if last_run is None:
                return JSONResponse(
                    status_code=400,
                    content=ErrorResponse(
                        message="No failed or interrupted run to retry.",
                        suggested_action="Choose another action from the available list.",
                        error_code="NO_RUN_TO_RETRY",
                    ).model_dump(),
                )

            retry_action = last_run.action

            # 5b. Re-check confirmation for original action's risk category
            original_entry = actions_config.get(retry_action, {})
            orig_risk = original_entry.get("risk_category")
            if orig_risk and requires_confirmation(orig_risk):
                confirmed = body.get("confirmed", False) if body else False
                if not confirmed:
                    return {
                        "status": "needs_approval",
                        "message": (
                            f"This retry requires confirmation ({orig_risk})."
                        ),
                        "risk_category": orig_risk,
                        "action": action,
                        "state_unchanged": True,
                    }

            # 5c. Validate retry is stage-valid from current state
            try:
                machine.transition(current, "retry", GUARD_MAP, guard_context)
            except StateTransitionError as e:
                return JSONResponse(
                    status_code=400,
                    content=ErrorResponse(
                        message=e.message,
                        suggested_action=(
                            "Retry is not available from the current "
                            "workflow stage."
                        ),
                        error_code="INVALID_RETRY",
                    ).model_dump(),
                )

            resolved_action = retry_action

            # Resolve the original action's target (intermediate) state
            intermediate_state = self._resolve_action_target_state(
                resolved_action, config, level
            )
            if intermediate_state is None:
                return JSONResponse(
                    status_code=400,
                    content=ErrorResponse(
                        message=(
                            f"Cannot resolve target state for action "
                            f"'{resolved_action}'."
                        ),
                        suggested_action=(
                            "The action to retry is not recognized by "
                            "the current workflow."
                        ),
                        error_code="INVALID_RETRY",
                    ).model_dump(),
                )

            # For retry, intermediate_state is the original action's target
            # started_events stays empty (no new transition event to log)
        else:
            # 5d. First transition (preview only — no state write)
            try:
                intermediate_state, started_events = machine.transition(
                    current, action, GUARD_MAP, guard_context
                )
            except StateTransitionError as e:
                return JSONResponse(
                    status_code=400,
                    content=ErrorResponse(
                        message=e.message,
                        suggested_action="Try one of the available actions.",
                        error_code="INVALID_TRANSITION",
                    ).model_dump(),
                )
            resolved_action = action

        # 6. Assemble context bundle
        adapter_action = adapter_action_override or resolved_action
        try:
            context_bundle = self.context_service.assemble(
                adapter_action, current_state
            )
        except ValueError as e:
            return JSONResponse(
                status_code=400,
                content=ErrorResponse(
                    message=str(e),
                    suggested_action="Check that all required artifacts exist and try again.",
                    error_code="CONTEXT_ERROR",
                ).model_dump(),
            )

        # 7. Check adapter availability
        if self.adapter is None:
            return {
                "status": "adapter_not_available",
                "message": (
                    "No execution backend is configured. Adapter-backed actions "
                    "require a configured backend (e.g., OpenCode)."
                ),
                "action": action,
                "state_unchanged": True,
            }

        # 8. Create RunRecord (acquires active-run lock)
        try:
            run = self.run_store.create_run(
                resolved_action, phase_id=current_state.current_phase_id
            )
        except RuntimeError as e:
            return JSONResponse(
                status_code=409,
                content={
                    "status": "active_run_exists",
                    "message": str(e),
                },
            )

        # 9. Record RunRecord metadata
        template_name = self._get_template_name(adapter_action)
        template_path = self._resolve_template_path(template_name)
        template_version = (
            self._hash_file(template_path) if template_path.exists() else None
        )

        artifact_refs = self._build_artifact_refs(adapter_action, current_state)

        context_hash = self.run_store.compute_context_hash(context_bundle)

        run.template_version = template_version
        run.working_directory = str(Path(self.repo_path).resolve())
        run.input_artifact_refs = artifact_refs
        run.command_context_hash = context_hash
        self.run_store._persist(run)

        # 10. Start run
        self.run_store.start_run(run.run_id)

        # ── COMMIT: state mutation begins ──────────────────────────

        # 11. Write intermediate state + log started events
        current_state = self._apply_state(
            current_state, intermediate_state, level
        )
        current_state.updated_at = datetime.now(timezone.utc)
        self.store.write_json(
            "current-state.json",
            json.loads(current_state.model_dump_json()),
        )

        for evt in started_events if action != "retry" else []:
            self.event_log.append(
                self._make_event(evt, resolved_action, current_state, level)
            )

        # Capture prior phase state for auto-dispatch (intermediate state,
        # before completion events)
        prior_phase_state = current_state.current_phase_state

        # 12. Execute adapter
        adapter_config_entry = self._get_adapter_config(adapter_action)
        timeout = adapter_config_entry.get("timeout_seconds", 120)

        output_path = str(
            Path(self.repo_path)
            / ".flowbench"
            / "runs"
            / run.run_id
            / "output.json"
        )

        context_bundle["output_path"] = output_path

        try:
            result = await self.adapter.execute(
                action=adapter_action,
                context_bundle=context_bundle,
                run_id=run.run_id,
                working_dir=self.repo_path,
                timeout=timeout,
                output_path=output_path,
            )
        except Exception as e:
            result = AdapterResult(
                success=False, outcome="failed", output_text=str(e)
            )

        # 13. Interpret result → write stage artifact
        parsed_output = None
        if result.success:
            artifact_filename = self._map_adapter_action_to_artifact(
                adapter_action, current_state
            )
            if artifact_filename:
                try:
                    output_data = json.loads(result.output_text)
                    if not isinstance(output_data, dict):
                        raise ValueError(
                            "Adapter output is not a JSON object"
                        )
                    if artifact_filename == "audit.json":
                        from services.orchestrator.schemas.artifacts import AuditArtifact
                        try:
                            AuditArtifact.model_validate(output_data)
                        except Exception:
                            raise ValueError(
                                "Audit artifact failed schema validation"
                            )
                        if output_data.get("repo_path") != current_state.repo_path:
                            raise ValueError(
                                f"Audit repo_path '{output_data.get('repo_path')}' "
                                f"does not match active repository "
                                f"'{current_state.repo_path}'"
                            )
                    parsed_output = output_data
                    self.store.write_json(artifact_filename, output_data)
                except (json.JSONDecodeError, ValueError, OSError) as e:
                    result = AdapterResult(
                        success=False,
                        outcome="failed",
                        output_text=(
                            f"Adapter returned invalid output: {e}\n"
                            f"{result.output_text}"
                        ),
                    )

        # 14. Determine two-phase vs single-phase
        intermediate_config = machine.transitions.get(
            intermediate_state, {}
        )
        has_completion_events = bool(
            intermediate_config.get("events", {})
        )

        effective_success = result.success
        if result.success and adapter_action == "test_phase" and isinstance(parsed_output, dict):
            summary = parsed_output.get("summary", {})
            if isinstance(summary, dict) and summary.get("failed", 0) > 0:
                effective_success = False

        if has_completion_events and result.success:
            event_key = self._find_completion_event_key(
                intermediate_config, effective_success
            )
            try:
                final_state, completion_events = machine.handle_event(
                    intermediate_state,
                    event_key,
                    effective_success,
                    GUARD_MAP,
                    {},
                )
            except StateTransitionError:
                final_state = intermediate_state
                completion_events = []
        elif has_completion_events and not result.success:
            if adapter_action == "test_phase":
                final_state = "phase_blocked" if level == "phase" else "project_blocked"
                completion_events = [{
                    "event": "adapter_failed",
                    "from_state": intermediate_state,
                    "to_state": final_state,
                }]
            else:
                event_key = self._find_completion_event_key(
                    intermediate_config, result.success
                )
                try:
                    final_state, completion_events = machine.handle_event(
                        intermediate_state,
                        event_key,
                        result.success,
                        GUARD_MAP,
                        {},
                    )
                except StateTransitionError:
                    final_state = intermediate_state
                    completion_events = []
        else:
            final_state = intermediate_state
            completion_events = []

        # 15. Write final state + log completion events
        current_state = self._apply_state(
            current_state, final_state, level
        )
        current_state.updated_at = datetime.now(timezone.utc)
        self.store.write_json(
            "current-state.json",
            json.loads(current_state.model_dump_json()),
        )

        for evt in completion_events:
            self.event_log.append(
                self._make_event(evt, resolved_action, current_state, level)
            )

        # 16. Complete RunRecord (parent)
        self.run_store.complete_run(
            run_id=run.run_id,
            status=result.outcome,
            output_artifact_path=result.artifact_path,
            failure_message=(
                None if result.success else result.output_text[:2000]
            ),
        )

        # 16.5 Auto-dispatch on phase state entry
        label_entry = None if adapter_action_override else action_entry
        label = self._resolve_label(adapter_action, label_entry)
        if level == "phase":
            prior = CurrentState(**current_state.model_dump())
            prior.current_phase_state = prior_phase_state
            auto_result = await self._check_auto_dispatch(
                prior, current_state, config, actions_config
            )
            if auto_result:
                child_response, child_adapter = auto_result
                merged = dict(child_response)
                merged["message"] = f"{label}. {child_response.get('message', '')}"
                merged["auto_dispatched"] = [child_adapter]
                return merged

        # 17. Return
        return {
            "status": "ok" if result.success else "failed",
            "outcome": result.outcome,
            "new_state": final_state,
            "message": (
                f"{'Completed' if result.success else 'Failed'}: {label}."
            ),
            "run_id": run.run_id,
        }

    async def _check_auto_dispatch(
        self,
        prior_state: CurrentState,
        new_state: CurrentState,
        config: dict,
        actions_config: dict,
    ) -> tuple[dict, str] | None:
        if prior_state.current_phase_state == new_state.current_phase_state:
            return None

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

        if isinstance(result, JSONResponse):
            return None
        return (result, adapter_action)

    def _find_completion_event_key(
        self, state_config: dict, success: bool
    ) -> str:
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

    def _resolve_template_path(self, template_name: str) -> Path:
        return (
            Path(__file__).resolve().parents[3]
            / "adapters" / "commands" / template_name
        )

    def _get_adapter_config(self, action: str) -> dict:
        config = self.context_service._load_adapter_config()
        return config.get("methods", {}).get(
            action, {"timeout_seconds": 120}
        )

    def _hash_file(self, path: Path) -> str | None:
        try:
            return hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        except OSError:
            return None

    def _build_artifact_refs(
        self, action: str, state: CurrentState
    ) -> dict[str, str]:
        adapter_action = self.context_service.get_adapter_action(action)
        if adapter_action is None:
            return {}
        rules = self.context_service.get_context_rules(adapter_action)
        if rules is None:
            return {}
        refs = {}
        for key in rules.get("required", []) + rules.get("optional", []):
            path = self._resolve_artifact_path(key, state)
            if path:
                refs[key] = str(
                    path.relative_to(Path(self.repo_path) / ".flowbench")
                )
        return refs

    def _resolve_artifact_path(
        self, key: str, state: CurrentState
    ) -> Path | None:
        base = Path(self.repo_path) / ".flowbench"
        phase_id = state.current_phase_id
        mapping = {
            "scope": base / "scope.json",
            "current_plan": (
                base / f"phase-plan-{phase_id}.json"
                if phase_id
                else base / "master-plan.json"
            ),
            "master_plan": base / "master-plan.json",
            "phase_plan": (
                base / f"phase-plan-{phase_id}.json" if phase_id else None
            ),
            "build_summary": (
                base / f"build-summary-{phase_id}.json"
                if phase_id
                else None
            ),
            "latest_build_summary": (
                base / f"build-summary-{phase_id}.json"
                if phase_id
                else None
            ),
            "review_findings": (
                base / f"review-findings-{phase_id}.json"
                if phase_id
                else None
            ),
            "findings_or_failures": (
                base / f"review-findings-{phase_id}.json"
                if phase_id
                else None
            ),
            "test_results": (
                base / f"test-results-{phase_id}.json"
                if phase_id
                else None
            ),
            "existing_app_audit": base / "audit.json",
            "sharpening_history": base / "sharpening-notes.json",
            "phase_handoff": (
                base / f"handoff-{phase_id}.json" if phase_id else None
            ),
            "master_plan_excerpt": base / "master-plan.json",
            "prior_handoff": None,
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
        if state.current_phase_id:
            phase_id_placeholder = state.current_phase_id
            phase_suffix_local = f"-{phase_id_placeholder}"
        else:
            phase_suffix_local = ""
        mapping = {
            "generate_master_plan": "master-plan.json",
            "refine_plan": "master-plan.json",
            "sharpen_plan": "sharpening-notes.json",
            "sharpen_phase_plan": "sharpening-notes.json",
            "generate_phase_plan": f"phase-plan{phase_suffix_local}.json",
            "start_building": f"build-summary{phase_suffix_local}.json",
            "build_phase": f"build-summary{phase_suffix_local}.json",
            "review_phase": f"review-findings{phase_suffix_local}.json",
            "test_phase": f"test-results{phase_suffix_local}.json",
            "fix_findings": f"review-findings{phase_suffix_local}.json",
            "fix_failures": f"test-results{phase_suffix_local}.json",
            "generate_handoff": f"handoff{phase_suffix_local}.json",
            "audit_existing_app": "audit.json",
            "load_existing_project": "audit.json",
            "summarize_state": None,
            "ask_for_summary": None,
        }
        return mapping.get(action)

    def _resolve_action_target_state(
        self, action: str, config: dict, level: str
    ) -> str | None:
        if level == "project":
            states = config.get("project_machine", {}).get("states", {})
        else:
            states = config.get("phase_machine", {}).get("states", {})

        for state_name, state_def in states.items():
            actions = state_def.get("actions", {})
            for a_name, a_def in actions.items():
                if a_name == action:
                    return a_def.get("target_state")
        return None

    def _apply_state(
        self, state: CurrentState, new_substate: str, level: str
    ) -> CurrentState:
        if level == "project":
            state.project_state = new_substate
            if new_substate in (
                "scope_ready",
                "master_plan_sharpening",
                "project_complete",
                "phase_queue_ready",
            ):
                state.current_phase_id = None
                state.current_phase_state = None
        else:
            state.current_phase_state = new_substate
        return state

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

    def _make_event(
        self,
        evt: dict,
        action: str,
        state: CurrentState,
        level: str,
    ) -> dict:
        return {
            "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "event": evt["event"],
            "from_state": evt["from_state"],
            "to_state": evt["to_state"],
            "actor": "builder",
            "description": self._resolve_label(action, None),
            "phase_id": state.current_phase_id,
            "artifact_type": None,
        }

    def _resolve_label(self, action_name: str, entry: dict | None) -> str:
        label = ACTION_LABELS.get(action_name)
        if label:
            return label
        if entry:
            raw = (entry.get("label") or "").strip()
            if raw:
                return raw
        return action_name.replace("_", " ").title()
