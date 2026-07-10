import pytest

from services.orchestrator.engine.guards import (
    all_phases_complete,
    has_upcoming_phases,
    next_phase_exists,
    scope_has_content,
)
from services.orchestrator.engine.phase_machine import create_phase_machine
from services.orchestrator.engine.project_machine import create_project_machine
from services.orchestrator.engine.state_machine import StateTransitionError

GUARDS = {
    "scope_has_content": scope_has_content,
    "next_phase_exists": next_phase_exists,
    "has_upcoming_phases": has_upcoming_phases,
    "all_phases_complete": all_phases_complete,
}


@pytest.fixture
def project_machine(sample_transitions):
    return create_project_machine(sample_transitions)


@pytest.fixture
def phase_machine(sample_transitions):
    return create_phase_machine(sample_transitions)


class TestProjectMachine:
    def test_start_new_project_valid(self, project_machine):
        new_state, events = project_machine.transition(
            "starting", "start_new_project", GUARDS, {}
        )
        assert new_state == "scope_ready"
        assert len(events) == 1
        assert events[0]["event"] == "project_created"

    def test_invalid_transition_raises(self, project_machine):
        with pytest.raises(StateTransitionError) as exc:
            project_machine.transition(
                "starting", "accept_master_plan", GUARDS, {}
            )
        assert "right now" in str(exc.value).lower()

    def test_edit_scope_self_loop(self, project_machine):
        new_state, events = project_machine.transition(
            "scope_ready", "edit_scope", GUARDS, {}
        )
        assert new_state == "scope_ready"
        assert len(events) == 1

    def test_accept_master_plan_from_sharpening(self, project_machine):
        new_state, events = project_machine.transition(
            "master_plan_sharpening", "accept_master_plan", GUARDS, {}
        )
        assert new_state == "phase_queue_ready"

    def test_cancel_project_from_scope_ready(self, project_machine):
        new_state, events = project_machine.transition(
            "scope_ready", "cancel_project", GUARDS, {}
        )
        assert new_state == "project_complete"

    def test_view_all_phases_navigation(self, project_machine):
        new_state, events = project_machine.transition(
            "phase_queue_ready", "view_all_phases", GUARDS, {}
        )
        assert new_state == "phase_queue_ready"

    def test_unknown_state_raises(self, project_machine):
        with pytest.raises(StateTransitionError):
            project_machine.transition("nonexistent", "start_new_project", GUARDS, {})

    def test_get_valid_actions_returns_list(self, project_machine):
        actions = project_machine.get_valid_actions("starting")
        assert len(actions) >= 1
        assert any(a["action"] == "start_new_project" for a in actions)

    def test_get_valid_actions_empty(self, project_machine):
        actions = project_machine.get_valid_actions("phase_in_progress")
        assert actions == []

    def test_message_is_user_facing(self, project_machine):
        try:
            project_machine.transition("starting", "accept_master_plan", GUARDS, {})
        except StateTransitionError as e:
            msg = str(e).lower()
            assert "right now" in msg
            assert "starting" not in msg or "getting started" in msg

    def test_guard_rejection_message(self, project_machine):
        with pytest.raises(StateTransitionError) as exc:
            project_machine.transition(
                "scope_ready", "generate_master_plan", GUARDS, {"scope": ""}
            )
        assert "condition" in str(exc.value).lower() or "right now" in str(exc.value)


class TestPhaseMachine:
    def test_generate_phase_plan(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_starting", "generate_phase_plan", GUARDS, {}
        )
        assert new_state == "phase_plan"

    def test_skip_phase(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_starting", "skip_phase", GUARDS, {}
        )
        assert new_state == "phase_complete"

    def test_accept_phase_plan(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_sharpening", "accept_phase_plan", GUARDS, {}
        )
        assert new_state == "phase_ready_to_build"

    def test_pause_maps_to_blocked(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_building", "pause", GUARDS, {}
        )
        assert new_state == "phase_blocked"

    def test_accept_review(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_reviewing", "accept_review", GUARDS, {}
        )
        assert new_state == "phase_testing"

    def test_accept_test_results(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_testing", "accept_test_results", GUARDS, {}
        )
        assert new_state == "phase_handoff"

    def test_accept_handoff(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_handoff", "accept_handoff", GUARDS, {}
        )
        assert new_state == "phase_complete"

    def test_abandon_phase_returns_to_queue(self, phase_machine):
        new_state, events = phase_machine.transition(
            "phase_blocked", "abandon_phase", GUARDS, {}
        )
        assert new_state == "phase_queue_ready"

    def test_invalid_phase_transition(self, phase_machine):
        with pytest.raises(StateTransitionError):
            phase_machine.transition(
                "phase_starting", "accept_handoff", GUARDS, {}
            )


class TestEvents:
    def test_draft_complete(self, project_machine):
        new_state, _ = project_machine.handle_event(
            "master_plan_drafting", "draft", True, GUARDS, {}
        )
        assert new_state == "master_plan_sharpening"

    def test_draft_failed(self, project_machine):
        new_state, _ = project_machine.handle_event(
            "master_plan_drafting", "draft", False, GUARDS, {}
        )
        assert new_state == "project_blocked"

    def test_build_complete(self, phase_machine):
        new_state, _ = phase_machine.handle_event(
            "phase_building", "build", True, GUARDS, {}
        )
        assert new_state == "phase_reviewing"

    def test_build_failed(self, phase_machine):
        new_state, _ = phase_machine.handle_event(
            "phase_building", "build", False, GUARDS, {}
        )
        assert new_state == "phase_blocked"

    def test_fix_complete_returns_to_review(self, phase_machine):
        new_state, _ = phase_machine.handle_event(
            "phase_fixing", "fix", True, GUARDS, {}
        )
        assert new_state == "phase_reviewing"

    def test_all_phases_complete(self, project_machine):
        new_state, _ = project_machine.handle_event(
            "phase_queue_ready", "all_phases_complete", True, GUARDS, {}
        )
        assert new_state == "project_complete"


class TestGuards:
    def test_scope_has_content_true(self):
        assert scope_has_content({"scope": "Build an app"})

    def test_scope_has_content_false(self):
        assert not scope_has_content({"scope": ""})

    def test_scope_has_content_whitespace_only(self):
        assert not scope_has_content({"scope": "   "})

    def test_next_phase_exists_true(self):
        assert next_phase_exists({"phase_queue": [
            {"phase_id": "phase_001", "status": "upcoming"},
        ]})

    def test_next_phase_exists_false(self):
        assert not next_phase_exists({"phase_queue": [
            {"phase_id": "phase_001", "status": "complete"},
        ]})

    def test_has_upcoming_phases_true(self):
        assert has_upcoming_phases({"phase_queue": [
            {"status": "upcoming"},
            {"status": "upcoming"},
            {"status": "complete"},
        ]})

    def test_has_upcoming_phases_false(self):
        assert not has_upcoming_phases({"phase_queue": [
            {"status": "upcoming"},
        ]})

    def test_all_phases_complete_true(self):
        assert all_phases_complete({"phase_queue": [
            {"status": "complete"},
            {"status": "complete"},
        ]})

    def test_all_phases_complete_one_not_done(self):
        assert not all_phases_complete({"phase_queue": [
            {"status": "complete"},
            {"status": "upcoming"},
        ]})

    def test_all_phases_complete_empty(self):
        assert not all_phases_complete({"phase_queue": []})


class TestNoIO:
    def test_no_io_in_engine(self):
        import os.path
        engine_dir = os.path.join(
            os.path.dirname(__file__),
            "..",
            "engine",
        )
        engine_dir = os.path.normpath(engine_dir)
        import ast
        import pathlib
        for f in pathlib.Path(engine_dir).glob("*.py"):
            if f.name == "__init__.py" and f.parent.name == "engine":
                continue
            source = f.read_text()
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        assert alias.name not in (
                            "json", "os", "pathlib", "subprocess",
                            "socket", "requests", "httpx",
                        ), f"{f.name} imports {alias.name}"
                elif isinstance(node, ast.ImportFrom):
                    module = node.module or ""
                    assert module.split(".")[0] not in (
                        "json", "os", "pathlib", "subprocess",
                        "socket", "requests", "httpx",
                    ), f"{f.name} imports from {module}"
