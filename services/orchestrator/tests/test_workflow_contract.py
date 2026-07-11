import json
from pathlib import Path

import pytest

from services.orchestrator.engine.guards import (
    all_phases_complete,
    has_upcoming_phases,
    next_phase_exists,
    scope_has_content,
)

GUARD_FUNCTIONS = {
    "scope_has_content": scope_has_content,
    "next_phase_exists": next_phase_exists,
    "has_upcoming_phases": has_upcoming_phases,
    "all_phases_complete": all_phases_complete,
}

CONFIG_DIR = Path(__file__).parents[3] / "config"


def load_json(name):
    path = CONFIG_DIR / name
    with open(str(path)) as f:
        return json.load(f)


WORKFLOWS = load_json("workflows.json")
ACTIONS = load_json("actions.json")
POLICIES = load_json("policies.json")
ADAPTER_CONFIG = load_json("adapters/opencode.json")


# Cross-machine transitions from phase machine → valid project states
CROSS_MACHINE_TARGETS = {"phase_queue_ready"}


def _all_actions_in_workflows():
    actions = set()
    for machine_key in ("project_machine", "phase_machine"):
        machine = WORKFLOWS.get(machine_key, {})
        for state_name, state_def in machine.get("states", {}).items():
            for action_name in state_def.get("actions", {}):
                actions.add(action_name)
    return actions


class TestContractValidation:
    def test_every_action_in_actions_json_exists_in_workflows(self):
        workflow_actions = _all_actions_in_workflows()
        for action_name in ACTIONS:
            if action_name not in workflow_actions:
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{action_name}' in actions.json not found in any workflow state."
                )

    def test_every_workflow_action_has_actions_json_entry(self):
        workflow_actions = _all_actions_in_workflows()
        for action_name in workflow_actions:
            if action_name not in ACTIONS:
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{action_name}' in workflows.json has no entry in actions.json."
                )

    def test_every_action_has_label(self):
        for name, entry in ACTIONS.items():
            label = entry.get("label", "")
            if not label or len(label.strip()) == 0:
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{name}' has empty label."
                )

    def test_every_action_has_description(self):
        for name, entry in ACTIONS.items():
            desc = entry.get("description", "")
            if not desc or len(desc.strip()) == 0:
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{name}' has empty description."
                )

    def test_every_action_has_action_type(self):
        for name, entry in ACTIONS.items():
            atype = entry.get("action_type")
            if atype not in ("system", "adapter", "navigation"):
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{name}' has invalid or missing action_type: {atype}"
                )

    def test_every_target_state_exists(self):
        for machine_key in ("project_machine", "phase_machine"):
            machine = WORKFLOWS.get(machine_key, {})
            valid_states = set(machine.get("states", {}).keys())
            for state_name, state_def in machine.get("states", {}).items():
                for action_name, action_def in state_def.get("actions", {}).items():
                    target = action_def.get("target_state")
                    if target and target not in valid_states \
                            and target not in CROSS_MACHINE_TARGETS:
                        pytest.fail(
                            f"Contract violation: see workflow-contract.json. "
                            f"Action '{action_name}' in state '{state_name}' "
                            f"targets '{target}' which is not a valid state in {machine_key}."
                        )

    def test_every_guard_exists(self):
        for machine_key in ("project_machine", "phase_machine"):
            machine = WORKFLOWS.get(machine_key, {})
            for state_name, state_def in machine.get("states", {}).items():
                for action_name, action_def in state_def.get("actions", {}).items():
                    guard = action_def.get("guard")
                    if guard and guard not in GUARD_FUNCTIONS:
                        pytest.fail(
                            f"Contract violation: see workflow-contract.json. "
                            f"Guard '{guard}' in action '{action_name}' "
                            "is not an imported function."
                        )

    def test_every_risk_category_in_policies(self):
        valid_categories = set(POLICIES.get("risk_categories", {}).keys())
        for action_name, entry in ACTIONS.items():
            cat = entry.get("risk_category")
            if cat and cat not in valid_categories:
                pytest.fail(
                    f"Contract violation: see workflow-contract.json. "
                    f"Action '{action_name}' has risk_category '{cat}' "
                    "not defined in policies.json."
                )

    def test_every_adapter_action_has_timeout(self):
        adapter_methods = ADAPTER_CONFIG.get("methods", {})
        for action_name, entry in ACTIONS.items():
            if entry.get("action_type") == "adapter":
                if action_name not in adapter_methods:
                    pytest.fail(
                        f"Contract violation: see workflow-contract.json. "
                        f"Adapter action '{action_name}' has no timeout "
                        "config in adapters/opencode.json."
                    )

    def test_no_duplicate_action_keys(self):
        assert len(ACTIONS) == len(set(ACTIONS.keys()))

    def test_scope_ready_events_match_contract(self):
        contract_path = Path(__file__).parents[3] / "docs" / "workflow-contract.json"
        with open(contract_path) as f:
            contract = json.load(f)

        wf_events = WORKFLOWS["project_machine"]["states"]["scope_ready"].get("events", {})
        ct_events = contract["states"]["scope_ready"].get("events", {})

        assert set(wf_events.keys()) == set(ct_events.keys()), (
            f"workflows.json scope_ready events {set(wf_events.keys())} != "
            f"contract scope_ready events {set(ct_events.keys())}"
        )
        for name in wf_events:
            assert wf_events[name]["target_state"] == ct_events[name]["target_state"], (
                f"Event '{name}' target mismatch: "
                f"workflows={wf_events[name]['target_state']} "
                f"contract={ct_events[name]['target_state']}"
            )

    def test_project_blocked_retry_in_workflows(self):
        project_blocked = WORKFLOWS["project_machine"]["states"]["project_blocked"]
        actions = project_blocked.get("actions", {})
        assert "retry" in actions, "project_blocked must have a retry action"
        assert actions["retry"]["action_type"] == "adapter", (
            "project_blocked.retry must be an adapter action"
        )
        assert actions["retry"]["target_state"] == "project_blocked"

    def test_project_blocked_retry_in_contract(self):
        contract_path = Path(__file__).parents[3] / "docs" / "workflow-contract.json"
        with open(contract_path) as f:
            contract = json.load(f)

        project_blocked = contract["states"]["project_blocked"]
        actions = project_blocked.get("actions", {})
        assert "retry" in actions, "contract project_blocked must have a retry action"
        assert actions["retry"]["action_type"] == "adapter"
        assert actions["retry"]["target_state"] == "project_blocked"

    def test_phase_id_format(self):
        for machine_key in ("project_machine", "phase_machine"):
            machine = WORKFLOWS.get(machine_key, {})
            for state_name, state_def in machine.get("states", {}).items():
                for action_name in state_def.get("actions", {}):
                    if action_name.startswith("phase_"):
                        parts = action_name.split("_", 2)
                        assert len(parts) == 3 and parts[2].isdigit(), (
                            f"Invalid phase action format: {action_name}"
                        )
                        assert len(parts[2]) == 3, (
                            f"Phase number should be 3 digits: {action_name}"
                        )
