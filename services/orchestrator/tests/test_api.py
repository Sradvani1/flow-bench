from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.orchestrator.main import app
from services.orchestrator.store.file_store import FileStore

client = TestClient(app)


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

    def test_adapter_action_returns_unavailable(self):
        resp = client.post("/api/v1/actions/generate_master_plan")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "adapter_not_available"
        assert data["state_unchanged"] is True

    def test_adapter_action_no_event(self):
        client.post("/api/v1/actions/generate_master_plan")
        assert not Path(".flowbench/events.ndjson").exists()

    def test_adapter_action_no_runrecord(self):
        client.post("/api/v1/actions/generate_master_plan")
        runs_dir = Path.cwd() / ".flowbench" / "runs"
        if runs_dir.exists():
            assert len(list(runs_dir.glob("*.json"))) == 0

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


class TestEvents:
    def test_get_events_empty(self):
        resp = client.get("/api/v1/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["events"] == []
        assert data["total"] == 0

    def test_get_events_with_action(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.get("/api/v1/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["events"][0]["event"] == "project_created"

    def test_get_events_paginated(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.get("/api/v1/events?limit=1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["events"]) == 1
        assert data["limit"] == 1

    def test_get_events_level_filter(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.get("/api/v1/events?level=project")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1


class TestRuns:
    def test_get_runs_empty(self):
        resp = client.get("/api/v1/runs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["runs"] == []

    def test_get_active_run_none(self):
        resp = client.get("/api/v1/runs/active")
        assert resp.status_code == 200
        data = resp.json()
        assert data["active"] is None

    def test_get_nonexistent_run(self):
        resp = client.get("/api/v1/runs/nonexistent")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error_code"] == "RUN_NOT_FOUND"


class TestErrorCases:
    def test_error_on_missing_state(self):
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        resp = client.post("/api/v1/actions/start_new_project")
        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "NO_PROJECT"

    def test_error_on_corrupt_artifact(self):
        client.post("/api/v1/actions/start_new_project")
        scope_path = Path.cwd() / ".flowbench" / "scope.json"
        scope_path.parent.mkdir(parents=True, exist_ok=True)
        with open(str(scope_path), "w") as f:
            f.write("not valid json")
        resp = client.post(
            "/api/v1/actions/edit_scope",
            json={"scope_content": "new content"},
        )
        assert resp.status_code == 200

    def test_updated_at_not_changed_on_read(self):
        resp1 = client.get("/api/v1/state")
        ts1 = resp1.json().get("updated_at")
        resp2 = client.get("/api/v1/state")
        ts2 = resp2.json().get("updated_at")
        assert ts1 == ts2

    def test_updated_at_changed_on_state_transition(self):
        resp1 = client.get("/api/v1/state")
        ts1 = resp1.json().get("updated_at")
        client.post("/api/v1/actions/start_new_project")
        resp2 = client.get("/api/v1/state")
        ts2 = resp2.json().get("updated_at")
        assert ts1 != ts2

    def test_state_error_no_stack_trace(self):
        resp = client.get("/api/v1/state")
        body = resp.text
        assert "Traceback" not in body
