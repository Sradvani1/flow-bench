import json
from pathlib import Path

from services.orchestrator.schemas.state import CurrentState
from services.orchestrator.store.file_store import FileStore


class ContextService:
    def __init__(self, repo_path: str, store: FileStore):
        self.repo_path = repo_path
        self.store = store
        self.contract = self._load_contract()
        self.adapter_config = self._load_adapter_config()

    def _load_contract(self) -> dict:
        path = Path(__file__).resolve().parents[3] / "docs" / "workflow-contract.json"
        with open(path) as f:
            return json.load(f)

    def _load_adapter_config(self) -> dict:
        path = Path(__file__).resolve().parents[3] / "config" / "adapters" / "opencode.json"
        with open(path) as f:
            return json.load(f)

    def get_adapter_action(self, action: str) -> str | None:
        for state_def in self._all_states():
            for a_name, a_def in state_def.get("actions", {}).items():
                if a_name == action:
                    return a_def.get("adapter_action")
        return None

    def _all_states(self) -> list[dict]:
        machines = self.contract.get("states", {})
        if machines:
            return list(machines.values())
        return []

    def get_context_rules(self, adapter_action: str) -> dict | None:
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
        adapter_action = self.get_adapter_action(action)
        if adapter_action is None:
            raise ValueError(
                f"Cannot resolve adapter_action for workflow action '{action}'"
            )

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
        return self.assemble(last_run_action, state)

    def _resolve_context_key(self, key: str, state: CurrentState) -> str | None:
        phase_id = state.current_phase_id
        if key == "scope":
            return self._json_artifact("scope.json")
        if key == "repo_path":
            return state.repo_path
        if key == "existing_app_audit":
            return self._json_artifact("audit.json")
        if key == "current_plan":
            if phase_id:
                return self._json_artifact(f"phase-plan-{phase_id}.json")
            return self._json_artifact("master-plan.json")
        if key == "master_plan":
            return self._json_artifact("master-plan.json")
        if key == "master_plan_excerpt":
            return self._json_artifact("master-plan.json")
        if key == "phase_definition":
            return self._resolve_phase_definition(state)
        if key == "phase_plan":
            if phase_id:
                return self._json_artifact(f"phase-plan-{phase_id}.json")
            return None
        if key == "phase_handoff":
            if phase_id:
                return self._json_artifact(f"handoff-{phase_id}.json")
            return None
        if key in ("build_summary", "latest_build_summary"):
            if phase_id:
                return self._json_artifact(f"build-summary-{phase_id}.json")
            return None
        if key == "review_findings":
            if phase_id:
                return self._json_artifact(f"review-findings-{phase_id}.json")
            return None
        if key == "test_results":
            if phase_id:
                return self._json_artifact(f"test-results-{phase_id}.json")
            return None
        if key == "findings_or_failures":
            result = None
            if phase_id:
                result = self._json_artifact(f"review-findings-{phase_id}.json")
            if result is None and phase_id:
                result = self._json_artifact(f"test-results-{phase_id}.json")
            return result
        if key == "sharpening_history":
            return self._json_artifact("sharpening-notes.json")
        if key == "prior_handoff":
            prev_id = self._prev_phase_id(state)
            if prev_id:
                return self._json_artifact(f"handoff-{prev_id}.json")
            return None
        if key in ("unresolved_issues", "next_phase_name"):
            return None
        return None

    def _json_artifact(self, name: str) -> str | None:
        data = self.store.read_json(name)
        if data is None:
            return None
        return json.dumps(data, default=str)

    def _resolve_phase_definition(self, state: CurrentState) -> str | None:
        if not state.current_phase_id:
            return None
        queue = self.store.read_json("phase-queue.json")
        if not queue or "phases" not in queue:
            return None
        for phase in queue["phases"]:
            if phase.get("phase_id") == state.current_phase_id:
                return json.dumps(phase, default=str)
        return None

    def _prev_phase_id(self, state: CurrentState) -> str | None:
        """Find the phase_id immediately before the current phase in the queue."""
        if not state.current_phase_id:
            return None
        queue = self.store.read_json("phase-queue.json")
        if not queue or "phases" not in queue:
            return None
        phases = queue["phases"]
        for i, phase in enumerate(phases):
            if phase.get("phase_id") == state.current_phase_id:
                if i > 0:
                    return phases[i - 1].get("phase_id")
        return None
