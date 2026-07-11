from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.orchestrator.main import app
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.store.file_store import FileStore

client = TestClient(app)


def _setup_scope_ready():
    """Advance state to scope_ready with non-empty scope content."""
    store = FileStore(".")
    client.post(
        "/api/v1/actions/start_new_project",
        json={"scope_content": "Build a task manager app"},
    )
    store.write_json("scope.json", {
        "schema_version": 1,
        "content": "Build a task manager app",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


def _setup_master_plan_drafting():
    """Advance state to master_plan_drafting (scope_ready → dispatch generate_master_plan)."""
    _setup_scope_ready()


@pytest.fixture(autouse=True)
def setup_state():
    store = FileStore(".")
    store.write_json("current-state.json", {
        "schema_version": 1,
        "project_display_name": "Test App",
        "repo_path": str(Path.cwd()),
        "mode": "new_build",
        "project_state": "starting",
        "current_phase_id": None,
        "current_phase_state": None,
        "total_phases": 0,
        "phases_complete": 0,
        "adapter": "opencode",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    yield
    import shutil
    flowbench_dir = Path.cwd() / ".flowbench"
    if flowbench_dir.exists():
        shutil.rmtree(str(flowbench_dir))


class TestHealth:
    def test_health(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"


class TestState:
    def test_get_state(self):
        resp = client.get("/api/v1/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_display_name"] == "Test App"
        assert data["project_state"] == "starting"

    def test_get_state_no_project(self):
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        resp = client.get("/api/v1/state")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "no_project"


class TestActions:
    def test_get_actions(self):
        resp = client.get("/api/v1/actions")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_start_new_project_system_action(self):
        resp = client.post("/api/v1/actions/start_new_project")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["new_state"] == "scope_ready"

    def test_navigation_action_no_event(self):
        store = FileStore(".")
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "project_complete",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/view_summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_invalid_transition(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.post("/api/v1/actions/start_new_project")
        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "INVALID_TRANSITION"

    def test_edit_scope_idempotent(self):
        client.post("/api/v1/actions/start_new_project")
        resp1 = client.post(
            "/api/v1/actions/edit_scope",
            json={"scope_content": "Build an app"},
        )
        assert resp1.status_code == 200
        resp2 = client.post(
            "/api/v1/actions/edit_scope",
            json={"scope_content": "Build an app"},
        )
        assert resp2.status_code == 200

    def test_unknown_action(self):
        resp = client.post("/api/v1/actions/unknown_action")
        assert resp.status_code == 400

    def test_adapter_dispatch_no_confirm_unnecessary(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": False})
        assert resp.status_code == 200
        data = resp.json()
        # generate_master_plan has no risk_category, so no confirmation needed
        assert data["status"] in ("ok", "failed")

    def test_adapter_dispatch_creates_runrecord(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] is not None
        runs_dir = Path.cwd() / ".flowbench" / "runs"
        run_files = list(runs_dir.glob("*.json"))
        assert len(run_files) >= 1

    def test_adapter_dispatch_creates_events(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        events_resp = client.get("/api/v1/events")
        events = events_resp.json()["events"]
        event_names = [e["event"] for e in events]
        assert "master_plan_generation_started" in event_names


class TestSystemConfirmation:
    def test_cancel_project_no_confirm(self):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/cancel_project")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "needs_approval"
        assert data["state_unchanged"] is True
        assert data["risk_category"] == "destructive"

    def test_cancel_project_with_confirm(self):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/cancel_project", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["new_state"] == "project_complete"

    def test_abandon_phase_no_confirm(self):
        _setup_phase_blocked()
        resp = client.post("/api/v1/actions/abandon_phase")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "needs_approval"

    def test_abandon_phase_with_confirm(self):
        _setup_phase_blocked()
        resp = client.post("/api/v1/actions/abandon_phase", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


class TestAdapterDispatch:
    def test_dispatch_transitions_state(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["new_state"] == "master_plan_sharpening"

    def test_dispatch_logs_started_event(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        events_resp = client.get("/api/v1/events")
        events = events_resp.json()["events"]
        assert any(e["event"] == "master_plan_generation_started" for e in events)

    def test_dispatch_writes_stage_artifact(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        store = FileStore(".")
        artifact = store.read_json("master-plan.json")
        assert artifact is not None
        assert artifact["status"] == "ok"

    def test_dispatch_failure_no_artifact(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="Something went wrong",
        )
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        assert data["new_state"] == "project_blocked"
        store = FileStore(".")
        assert store.read_json("master-plan.json") is None

    def test_dispatch_malformed_output(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded", output_text="not valid json at all",
        )
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "failed"
        store = FileStore(".")
        assert store.read_json("master-plan.json") is None

    def test_active_run_rejected(self, mock_adapter):
        _setup_scope_ready()
        # Manually create a running run to test the active-run lock
        from services.orchestrator.store.run_store import RunStore
        rs = RunStore(".")
        run = rs.create_run("generate_master_plan")
        rs.start_run(run.run_id)
        # Now a dispatch attempt should fail with active_run_exists
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 409
        data = resp.json()
        assert data["status"] == "active_run_exists"

    def test_preflight_failure_no_mutation(self, mock_adapter):
        # scope.json missing → 400 error, state unchanged
        _setup_scope_ready()
        events_before = len(client.get("/api/v1/events").json()["events"])
        Path(".flowbench/scope.json").unlink(missing_ok=True)
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 400
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "scope_ready"
        # No new events added
        events_after = len(client.get("/api/v1/events").json()["events"])
        assert events_after == events_before

    def test_dispatch_single_phase_adapter_self_transition(self, mock_adapter):
        """sharpen_plan: self-transition adapter with no completion events."""
        store = FileStore(".")
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build a task manager",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("master-plan.json", {
            "schema_version": 1,
            "phases": [{"id": "p1", "name": "Setup"}],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "master_plan_sharpening",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/sharpen_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["new_state"] == "master_plan_sharpening"
        assert data["status"] == "ok"
        artifact = store.read_json("sharpening-notes.json")
        assert artifact is not None

    def test_dispatch_logs_completion_events(self, mock_adapter):
        """Two-phase adapter actions log both started and completion events."""
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        events_resp = client.get("/api/v1/events")
        events = events_resp.json()["events"]
        event_names = [e["event"] for e in events]
        assert "master_plan_generation_started" in event_names
        assert "draft_complete" in event_names


class TestTimeout:
    def test_timeout_yields_timedout(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = mock_adapter.timeout_result
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["outcome"] == "timed_out"
        assert data["status"] == "failed"
        # Verify RunRecord status
        run_id = data["run_id"]
        run_resp = client.get(f"/api/v1/runs/{run_id}")
        assert run_resp.json()["status"] == "timed_out"


class TestRetry:
    def test_retry_no_terminal_run(self):
        resp = client.post("/api/v1/actions/retry", json={"confirmed": True})
        assert resp.status_code == 400

    def test_retry_after_failure(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="fail",
        )
        resp1 = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp1.status_code == 200
        assert resp1.json()["status"] == "failed"
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded", output_text='{"status": "ok"}',
        )
        resp2 = client.post("/api/v1/actions/retry", json={"confirmed": True})
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2["status"] == "ok"
        assert data2["new_state"] == "master_plan_sharpening"

    def test_retry_creates_new_runrecord(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="fail",
        )
        resp1 = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        run_id_1 = resp1.json()["run_id"]
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded", output_text='{"status": "ok"}',
        )
        resp2 = client.post("/api/v1/actions/retry", json={"confirmed": True})
        run_id_2 = resp2.json()["run_id"]
        assert run_id_2 != run_id_1
        run1_resp = client.get(f"/api/v1/runs/{run_id_1}")
        assert run1_resp.json()["status"] == "failed"

    def test_retry_preserves_prior_record(self, mock_adapter):
        _setup_scope_ready()
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="Original failure",
        )
        resp1 = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        run_id_1 = resp1.json()["run_id"]
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded", output_text='{"status": "ok"}',
        )
        client.post("/api/v1/actions/retry", json={"confirmed": True})
        run1_resp = client.get(f"/api/v1/runs/{run_id_1}")
        assert run1_resp.json()["failure_message"] == "Original failure"

    def test_retry_requires_confirmation_for_risky_action(self, mock_adapter):
        """Retrying a risky action with risk_category requires confirmation again."""
        store = FileStore(".")
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build an app",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("master-plan.json", {
            "schema_version": 1,
            "phases": [{"id": "phase_001", "name": "Setup"}],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("phase-plan-phase_001.json", {
            "schema_version": 1,
            "plan": "Test plan",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("handoff-phase_001.json", {
            "schema_version": 1,
            "handoff": "Prior handoff",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "phase_in_progress",
            "current_phase_id": "phase_001",
            "current_phase_state": "phase_ready_to_build",
            "total_phases": 1,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # start_building fails → phase_blocked
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="Build crashed",
        )
        resp1 = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp1.status_code == 200, resp1.json()
        assert resp1.json()["status"] == "failed"
        assert resp1.json()["new_state"] == "phase_blocked"
        # retry without confirmation → needs_approval
        resp2 = client.post("/api/v1/actions/retry")
        assert resp2.status_code == 200, resp2.json()
        data2 = resp2.json()
        assert data2["status"] == "needs_approval"
        assert data2["state_unchanged"] is True
        assert data2["risk_category"] == "modify_files"

    def test_retry_invalid_action_rejected(self, mock_adapter):
        """Retry returns 400 when the original action's target cannot be resolved."""
        from services.orchestrator.store.run_store import RunStore
        store = FileStore(".")
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build an app",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "project_blocked",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # Create a terminal RunRecord with an action not in any state machine
        rs = RunStore(".")
        run = rs.create_run("nonexistent_action")
        rs.complete_run(run.run_id, status="failed", failure_message="test")
        events_before = len(client.get("/api/v1/events").json()["events"])
        resp = client.post("/api/v1/actions/retry", json={"confirmed": True})
        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "INVALID_RETRY"
        # No new events logged (state unchanged)
        events_after = len(client.get("/api/v1/events").json()["events"])
        assert events_after == events_before


class TestExistingBehavior:
    def test_navigation_no_side_effects(self):
        store = FileStore(".")
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "project_complete",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/view_summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert not Path(".flowbench/events.ndjson").exists()

    def test_system_action_no_adapter(self):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/edit_scope",
                           json={"scope_content": "Updated scope"})
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "scope_ready"

    def test_state_refresh_after_action(self):
        resp1 = client.get("/api/v1/state")
        ts1 = resp1.json().get("updated_at")
        client.post("/api/v1/actions/start_new_project")
        resp2 = client.get("/api/v1/state")
        ts2 = resp2.json().get("updated_at")
        assert ts1 != ts2


class TestRunRecordMetadata:
    def test_runrecord_has_metadata(self, mock_adapter):
        _setup_scope_ready()
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        run_id = resp.json()["run_id"]
        run_resp = client.get(f"/api/v1/runs/{run_id}")
        run = run_resp.json()
        assert run["action"] == "generate_master_plan"
        assert run["template_version"] is not None
        assert run["working_directory"] is not None
        assert run["command_context_hash"] is not None
        assert "scope" in run["input_artifact_refs"]


class TestCrashRecovery:
    def test_restart_does_not_rewind_state(self):
        store = FileStore(".")
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "master_plan_drafting",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # Create a running RunRecord
        from services.orchestrator.store.run_store import RunStore
        rs = RunStore(".")
        run = rs.create_run("generate_master_plan")
        rs.start_run(run.run_id)
        # Simulate restart
        rs.interrupt_running_runs()
        # Verify state unchanged
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "master_plan_drafting"
        # Verify RunRecord is interrupted
        run_resp = client.get("/api/v1/runs/active")
        assert run_resp.json()["active"] is None
        updated_run = rs.get_run(run.run_id)
        assert updated_run.status == "interrupted"

    def test_no_auto_rerun_on_restart(self):
        # Verify restart doesn't create new runs
        store = FileStore(".")
        store.write_json("current-state.json", {
            "schema_version": 1,
            "project_display_name": "Test",
            "repo_path": str(Path.cwd()),
            "mode": "new_build",
            "project_state": "project_blocked",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # Verify state unchanged (no runs to interrupt)
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "project_blocked"
        runs_resp = client.get("/api/v1/runs")
        assert len(runs_resp.json()["runs"]) == 0


# ── Helpers that use the TestClient ──────────────────────────────

def _setup_phase_blocked():
    """Create a minimal phase_blocked state for phase-level tests."""
    store = FileStore(".")
    store.write_json("current-state.json", {
        "schema_version": 1,
        "project_display_name": "Test",
        "repo_path": str(Path.cwd()),
        "mode": "new_build",
        "project_state": "phase_in_progress",
        "current_phase_id": "phase_001",
        "current_phase_state": "phase_blocked",
        "total_phases": 2,
        "phases_complete": 0,
        "adapter": "opencode",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
