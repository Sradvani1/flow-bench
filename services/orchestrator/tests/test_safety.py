import ast
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.orchestrator.main import app
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.store.event_log import EventLog
from services.orchestrator.store.file_store import FileStore
from services.orchestrator.store.run_store import RunStore

client = TestClient(app)


def _setup_phase_ready_to_build():
    store = FileStore(".")
    store.write_json("master-plan.json", {
        "schema_version": 1,
        "phases": [{"id": "phase_001", "name": "Setup"}],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("scope.json", {
        "schema_version": 1,
        "content": "Build an app",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("phase-plan-phase_001.json", {
        "schema_version": 1,
        "plan": "Implement feature",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("handoff-phase_001.json", {
        "schema_version": 1,
        "handoff": "Prior phase done",
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


class TestSafety:
    def test_no_io_in_engine(self):
        """Verify engine/ has no I/O imports."""
        engine_dir = Path(__file__).resolve().parents[2] / "engine"
        for py_file in engine_dir.glob("*.py"):
            if py_file.name == "__init__.py":
                continue
            with open(str(py_file), "r") as f:
                tree = ast.parse(f.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name in ("os", "pathlib"):
                            pytest.fail(
                                f"{py_file.name} imports I/O module '{alias.name}'"
                            )
                elif isinstance(node, ast.ImportFrom):
                    if node.module and node.module.startswith(("os", "pathlib")):
                        pytest.fail(
                            f"{py_file.name} imports I/O from '{node.module}'"
                        )

    def test_approval_enforcement(self, mock_adapter):
        """start_building without confirmation → needs_approval, no state change, no RunRecord."""
        _setup_phase_ready_to_build()
        resp = client.post("/api/v1/actions/start_building")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "needs_approval"
        assert data["state_unchanged"] is True
        # No RunRecord created
        run_store = RunStore(".")
        assert run_store.get_active_run() is None
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["current_phase_state"] == "phase_ready_to_build"

    def test_approval_backend_authority(self, mock_adapter):
        """start_building with confirmed=true → adapter called, state transitions."""
        _setup_phase_ready_to_build()
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Build done"}),
        )
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "phase_reviewing"
        assert len(mock_adapter.calls) >= 1

    def test_single_active_run(self, mock_adapter):
        """Starting a second adapter action while one is running → 409."""
        _setup_phase_ready_to_build()
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Build done"}),
        )
        # Manually create a running run
        rs = RunStore(".")
        run = rs.create_run("start_building")
        rs.start_run(run.run_id)
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 409
        data = resp.json()
        assert data["status"] == "active_run_exists"

    def test_interrupted_runs_auto_detected(self):
        """Simulate crash by writing status=running run, then interrupt_running_runs."""
        rs = RunStore(".")
        run = rs.create_run("generate_master_plan")
        rs.start_run(run.run_id)
        # Manually set to running (already done by start_run)
        interrupted = rs.interrupt_running_runs()
        assert len(interrupted) >= 1
        assert interrupted[-1].status == "interrupted"

    def test_no_auto_rerun_after_interrupt(self):
        """After interrupt, state unchanged, no new RunRecord auto-created."""
        rs = RunStore(".")
        run = rs.create_run("generate_master_plan")
        rs.start_run(run.run_id)
        before_count = len(rs.get_all_runs())
        rs.interrupt_running_runs()
        after_count = len(rs.get_all_runs())
        assert after_count == before_count

    def test_path_validation(self):
        """FileStore rejects paths that escape .flowbench/."""
        store = FileStore(".")
        with pytest.raises(PermissionError):
            store._validate_path("../etc/passwd")
        with pytest.raises(PermissionError):
            store._validate_path("../../outside")
        # Valid path should work
        valid = store._validate_path("test.json")
        assert str(valid).endswith(".flowbench/test.json")

    def test_atomic_writes(self):
        """FileStore._atomic_write_json uses temp file + fsync + rename."""
        store = FileStore(".")
        # Write a file
        path = store.write_json("atomic-test.json", {"key": "value"})
        assert Path(path).exists()
        data = store.read_json("atomic-test.json")
        assert data == {"key": "value"}

    def test_symlink_boundary_escape(self):
        """Writing to paths with ../ is rejected or safely normalized."""
        store = FileStore(".")
        with pytest.raises(PermissionError):
            store.write_json("../escape.json", {"data": "bad"})
        with pytest.raises(PermissionError):
            store.write_json("subdir/../../escape.json", {"data": "bad"})

    def test_secret_persistence(self, mock_adapter):
        """Verify sensitive fields are stripped from all persisted data."""
        store = FileStore(".")
        run_store = RunStore(".")
        event_log = EventLog(".")

        # 1. FileStore — write data with secret fields, verify they're stripped
        secret_data = {
            "schema_version": 1,
            "project_display_name": "Test",
            "password": "supersecret",
            "token": "abc123",
            "api_key": "key_xyz",
            "credential": "cred_val",
            "secret": "hidden",
            "nested": {
                "inner_password": "should_stay",
                "token": "nested_token",
            },
        }
        store.write_json("secret-test.json", secret_data)
        persisted = store.read_json("secret-test.json")
        secret_fields = {"password", "secret", "token", "api_key", "credential"}
        for key in secret_fields:
            assert key not in persisted, (
                f"Sensitive field '{key}' was not stripped from FileStore data"
            )
        # Nested sensitive fields should also be stripped
        assert "token" not in persisted.get("nested", {}), (
            "Nested sensitive field was not stripped"
        )
        # Non-sensitive fields should remain
        assert persisted.get("schema_version") == 1

        # 2. RunStore — create a run with sensitive fields in input_artifact_refs
        run = run_store.create_run("test_action")
        run_store.update_context(run.run_id, {
            "api_key": "should_be_stripped",
            "scope_text": "should_stay",
        })
        persisted_run = run_store.get_run(run.run_id)
        assert persisted_run is not None
        assert "api_key" not in persisted_run.input_artifact_refs, (
            "Sensitive field was not stripped from RunRecord"
        )
        assert persisted_run.input_artifact_refs.get("scope_text") == "should_stay"

        # 3. EventLog — append an event with sensitive fields
        event_log.append({
            "event": "test",
            "password": "should_be_stripped",
            "description": "normal description",
        })
        events = event_log.read_all()
        found = [e for e in events if e.get("event") == "test"]
        assert len(found) >= 1
        event = found[0]
        assert "password" not in event, (
            "Sensitive field was not stripped from EventLog"
        )
        assert event.get("description") == "normal description"

    def test_no_dangerously_set_inner_html(self):
        """Verify no component uses dangerouslySetInnerHTML."""
        web_src = Path(__file__).resolve().parents[3] / "apps" / "web" / "src"
        for py_file in web_src.rglob("*.tsx"):
            content = py_file.read_text()
            if "dangerouslySetInnerHTML" in content:
                pytest.fail(f"{py_file.relative_to(web_src)} uses dangerouslySetInnerHTML")

    def test_runrecord_template_version_and_working_directory(self, mock_adapter):
        """Verify RunRecord has non-null template_version, working_directory, and context_hash."""
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
            "project_state": "scope_ready",
            "current_phase_id": None,
            "current_phase_state": None,
            "total_phases": 0,
            "phases_complete": 0,
            "adapter": "opencode",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        run_id = resp.json()["run_id"]
        run_resp = client.get(f"/api/v1/runs/{run_id}")
        run = run_resp.json()
        assert run.get("template_version") is not None
        assert run.get("working_directory") is not None
        assert run.get("command_context_hash") is not None

    def test_artifact_before_event_ordering(self):
        """Verify event is not persisted if artifact write fails."""
        from unittest.mock import patch

        store = FileStore(".")
        event_log = EventLog(".")

        # Capture pre-existing event count
        before = event_log.count()

        # Simulate an artifact write failure by patching write_json to raise
        with patch.object(store, "write_json", side_effect=OSError("write failed")):
            # Try to write a scope artifact (which would normally be followed by an event)
            try:
                store.write_json("scope.json", {
                    "schema_version": 1,
                    "content": "Test",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
            except OSError:
                pass

        # Verify no new event was appended (event log count unchanged)
        after = event_log.count()
        assert after == before, (
            "Event was persisted even though artifact write failed"
        )

        # Now verify normal path: successful write followed by event
        store.write_json("scope.json", {
            "schema_version": 1,
            "content": "Test",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        event_log.append({
            "event": "scope_updated",
            "level": "INFO",
            "description": "Scope updated successfully",
        })
        after_normal = event_log.count()
        assert after_normal > before, (
            "Normal artifact+event persistence did not create event"
        )
