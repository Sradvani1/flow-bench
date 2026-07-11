import copy

PRODUCT_LABELS = {
    "starting": "Getting started",
    "scope_ready": "Scope is ready",
    "master_plan_drafting": "Creating the master plan",
    "master_plan_sharpening": "Refining the plan",
    "phase_queue_ready": "Ready to start phases",
    "phase_in_progress": "Phase in progress",
    "phase_handoff": "Reviewing phase handoff",
    "project_blocked": "Project needs attention",
    "project_complete": "Project complete",
    "phase_starting": "Preparing phase",
    "phase_plan": "Creating phase plan",
    "phase_sharpening": "Refining phase plan",
    "phase_ready_to_build": "Ready to build",
    "phase_building": "Building",
    "phase_reviewing": "Reviewing results",
    "phase_testing": "Testing",
    "phase_fixing": "Fixing issues",
    "phase_complete": "Phase complete",
    "phase_blocked": "Phase needs attention",
}

ACTION_LABELS = {
    "start_new_project": "Start new project",
    "load_existing_project": "Load existing app",
    "change_backend": "Change backend",
    "edit_scope": "Edit scope",
    "generate_master_plan": "Generate master plan",
    "cancel_project": "Cancel project",
    "refine_plan": "Refine the plan",
    "sharpen_plan": "Refine the plan",
    "accept_master_plan": "Accept the plan",
    "start_next_phase": "Start next phase",
    "view_all_phases": "View all phases",
    "reorder_phases": "Re-order phases",
    "accept_handoff": "Accept handoff",
    "replan_from_here": "Re-plan from here",
    "revise_scope": "Revise scope",
    "view_summary": "View summary",
    "archive_project": "Archive project",
    "generate_phase_plan": "Generate phase plan",
    "skip_phase": "Skip this phase",
    "cancel_phase": "Cancel phase",
    "sharpen_phase_plan": "Sharpen this plan",
    "accept_phase_plan": "Accept phase plan",
    "start_building": "Start building",
    "change_phase_plan": "Change phase plan",
    "pause": "Pause",
    "ask_for_summary": "Ask for a summary",
    "accept_review": "Accept review",
    "fix_findings": "Fix findings",
    "override_and_continue": "Override and continue",
    "accept_test_results": "Accept test results",
    "fix_failures": "Fix failures",
    "skip_tests": "Skip tests",
    "generate_handoff": "Generate handoff notes",
    "view_handoff_notes": "View handoff notes",
    "retry": "Retry",
    "replan_phase": "Re-plan phase",
    "abandon_phase": "Abandon phase",
}


class StateTransitionError(Exception):
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class StateMachine:
    def __init__(self, transitions: dict):
        self.transitions = copy.deepcopy(transitions)

    def get_valid_actions(self, state: str) -> list[dict]:
        state_config = self.transitions.get(state, {})
        actions = state_config.get("actions", {})
        result = []
        for action_name, action_def in actions.items():
            if action_name.startswith("_"):
                continue
            result.append({
                "action": action_name,
                "target_state": action_def.get("target_state"),
                "action_type": action_def.get("action_type", "system"),
                "guard": action_def.get("guard"),
            })
        return result

    def transition(
        self, current_state: str, action: str, guards: dict, context: dict
    ) -> tuple[str, list[dict]]:
        state_config = self.transitions.get(current_state)
        if state_config is None:
            state_label = PRODUCT_LABELS.get(current_state, current_state)
            raise StateTransitionError(
                f"Unknown state '{state_label}'."
            )

        action_def = state_config.get("actions", {}).get(action)
        if action_def is None:
            state_label = PRODUCT_LABELS.get(current_state, current_state)
            action_label = ACTION_LABELS.get(action, action)
            valid = self.get_valid_actions(current_state)
            valid_labels = [
                ACTION_LABELS.get(a["action"], a["action"])
                for a in valid
            ]
            suggestions = ", ".join(f"'{label}'" for label in valid_labels)
            raise StateTransitionError(
                f"You can't '{action_label}' right now. "
                f"Try one of these instead: {suggestions}."
            )

        guard_name = action_def.get("guard")
        if guard_name:
            guard_fn = guards.get(guard_name)
            if guard_fn and not guard_fn(context):
                state_label = PRODUCT_LABELS.get(current_state, current_state)
                action_label = ACTION_LABELS.get(action, action)
                raise StateTransitionError(
                    f"You can't '{action_label}' from '{state_label}' right now. "
                    "A required condition hasn't been met yet."
                )

        target_state = action_def["target_state"]
        events = []
        event_name = action_def.get("event")
        if event_name:
            events.append({
                "event": event_name,
                "from_state": current_state,
                "to_state": target_state,
            })

        return target_state, events

    def handle_event(
        self,
        current_state: str,
        event: str,
        succeeded: bool,
        guards: dict,
        context: dict,
    ) -> tuple[str, list[dict]]:
        state_config = self.transitions.get(current_state)
        if state_config is None:
            state_label = PRODUCT_LABELS.get(current_state, current_state)
            raise StateTransitionError(
                f"Unknown state '{state_label}'."
            )

        events_config = state_config.get("events", {})
        candidates = [event]
        if succeeded:
            candidates.insert(0, f"{event}_complete")
        else:
            candidates.insert(0, f"{event}_failed")

        matched_key = None
        target_state = None
        for key in candidates:
            if key in events_config:
                target_state = events_config[key]["target_state"]
                matched_key = key
                break

        if target_state is None:
            raise StateTransitionError(
                f"The current state doesn't handle the '{event}' event."
            )

        return target_state, [{
            "event": matched_key,
            "from_state": current_state,
            "to_state": target_state,
        }]
