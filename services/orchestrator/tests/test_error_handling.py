from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.orchestrator.main import app
from services.orchestrator.store.file_store import FileStore
from services.orchestrator.store.run_store import RunStore

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


def _assert_error_response(resp, expected_status: int, expected_code: str):
    assert resp.status_code == expected_status, (
        f"Expected {expected_status}, got {resp.status_code}: {resp.json()}"
    )
    data = resp.json()
    assert "message" in data and len(data["message"]) > 0
    assert "suggested_action" in data and len(data["suggested_action"]) > 0
    assert data["error_code"] == expected_code, (
        f"Expected {expected_code}, got {data.get('error_code')}"
    )


class TestErrorHandling:
    def test_unknown_action(self):
        resp = client.post("/api/v1/actions/nonexistent_action")
        _assert_error_response(resp, 400, "UNKNOWN_ACTION")

    def test_no_project(self):
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        resp = client.post("/api/v1/actions/edit_scope", json={"scope_content": "test"})
        _assert_error_response(resp, 400, "NO_PROJECT")

    def test_invalid_transition(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.post("/api/v1/actions/accept_master_plan")
        _assert_error_response(resp, 400, "INVALID_TRANSITION")

    def test_active_run_exists(self, mock_adapter):
        client.post("/api/v1/actions/start_new_project")
        store = FileStore(".")
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Build an app",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        # Manually create a run
        rs = RunStore(".")
        run = rs.create_run("generate_master_plan")
        rs.start_run(run.run_id)
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 409
        data = resp.json()
        assert data["status"] == "active_run_exists"
        assert len(data["message"]) > 0

    def test_no_run_to_retry(self):
        client.post("/api/v1/actions/start_new_project")
        resp = client.post("/api/v1/actions/retry", json={"confirmed": True})
        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "NO_RUN_TO_RETRY"
        assert len(data["message"]) > 0
        assert len(data["suggested_action"]) > 0

    def test_internal_error_returns_500(self):
        # Trigger an unhandled exception by making the state file unreadable
        from fastapi.testclient import TestClient
        err_client = TestClient(app, raise_server_exceptions=False)
        state_path = Path.cwd() / ".flowbench" / "current-state.json"
        # Write invalid JSON (truncated) so parsing fails
        state_path.write_text('{"schema_version": 1, "project_state":')
        resp = err_client.post("/api/v1/actions/start_new_project")
        _assert_error_response(resp, 500, "INTERNAL_ERROR")

    def test_artifact_not_found(self):
        resp = client.get("/api/v1/artifacts/nonexistent.json")
        assert resp.status_code == 404
        data = resp.json()
        assert "error" in data
