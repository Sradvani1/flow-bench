import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.orchestrator.main import app
from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.store.file_store import FileStore
from services.orchestrator.store.run_store import RunStore

client = TestClient(app)


def _load_workflows():
    config_path = Path(__file__).resolve().parents[2] / "config" / "workflows.json"
    with open(str(config_path), "r") as f:
        return json.load(f)


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


def _setup_scope_ready():
    client.post(
        "/api/v1/actions/start_new_project",
        json={"scope_content": "Build a task manager app"},
    )
    store = FileStore(".")
    store.write_json("scope.json", {
        "schema_version": 1,
        "content": "Build a task manager app",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })


class TestGoldenPath:
    def test_multi_phase_completion_regression(self, mock_adapter):
        """Two-phase: first completes to phase_queue_ready, second to project_complete."""
        _setup_scope_ready()

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({
                "phases": [
                    {"phase_id": "phase_001", "name": "Setup"},
                    {"phase_id": "phase_002", "name": "Integration"},
                ],
                "plan": "Two-phase plan",
            }),
        )
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "master_plan_sharpening"

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"plan": "Sharpened two-phase plan"}),
        )
        resp = client.post("/api/v1/actions/sharpen_plan", json={"confirmed": True})
        assert resp.status_code == 200

        store = FileStore(".")
        store.write_json("phase-queue.json", {
            "schema_version": 1,
            "phases": [
                {"phase_id": "phase_001", "name": "Setup", "status": "upcoming"},
                {"phase_id": "phase_002", "name": "Integration", "status": "upcoming"},
            ],
        })
        resp = client.post("/api/v1/actions/accept_master_plan")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_queue_ready"

        # Phase 1: complete the first phase
        resp = client.post("/api/v1/actions/start_next_phase")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_in_progress"

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"plan": "Setup phase plan"}),
        )
        resp = client.post("/api/v1/actions/generate_phase_plan", json={"confirmed": True})
        assert resp.status_code == 200

        resp = client.post("/api/v1/actions/accept_phase_plan")
        assert resp.status_code == 200

        store = FileStore(".")
        store.write_json("handoff-phase_001.json", {
            "schema_version": 1, "handoff": "Setup done",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Build complete"}),
        )
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 200

        store = FileStore(".")
        store.write_json("review-findings-phase_001.json", {
            "schema_version": 1, "findings": "OK",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("test-results-phase_001.json", {
            "schema_version": 1, "results": "Pass",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/accept_review")
        assert resp.status_code == 200
        resp = client.post("/api/v1/actions/accept_test_results")
        assert resp.status_code == 200

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"handoff": "Phase 1 done"}),
        )
        resp = client.post("/api/v1/actions/generate_handoff", json={"confirmed": True})
        assert resp.status_code == 200

        # First phase accept_handoff: should land on phase_queue_ready, NOT project_complete
        resp = client.post("/api/v1/actions/accept_handoff")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_complete"
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "phase_queue_ready"
        assert state_resp.json()["current_phase_state"] is None
        assert state_resp.json()["current_phase_id"] is None
        assert state_resp.json()["phases_complete"] == 1

        # Phase 2: start and complete the second phase
        resp = client.post("/api/v1/actions/start_next_phase")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_in_progress"
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["current_phase_id"] == "phase_002"

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"plan": "Integration phase plan"}),
        )
        resp = client.post("/api/v1/actions/generate_phase_plan", json={"confirmed": True})
        assert resp.status_code == 200

        resp = client.post("/api/v1/actions/accept_phase_plan")
        assert resp.status_code == 200

        store = FileStore(".")
        store.write_json("handoff-phase_002.json", {
            "schema_version": 1, "handoff": "Integration done",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Integration build complete"}),
        )
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 200

        store = FileStore(".")
        store.write_json("review-findings-phase_002.json", {
            "schema_version": 1, "findings": "OK",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("test-results-phase_002.json", {
            "schema_version": 1, "results": "Pass",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/accept_review")
        assert resp.status_code == 200
        resp = client.post("/api/v1/actions/accept_test_results")
        assert resp.status_code == 200

        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"handoff": "Phase 2 done"}),
        )
        resp = client.post("/api/v1/actions/generate_handoff", json={"confirmed": True})
        assert resp.status_code == 200

        # Second phase accept_handoff: all phases done → project_complete
        resp = client.post("/api/v1/actions/accept_handoff")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_complete"
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "project_complete"
        assert state_resp.json()["current_phase_state"] is None
        assert state_resp.json()["phases_complete"] == 2

    def test_new_build_golden_path(self, mock_adapter):
        """Full lifecycle: new build through project completion."""
        _setup_scope_ready()

        # edit_scope
        resp = client.post("/api/v1/actions/edit_scope",
                           json={"scope_content": "Build a task manager with Python"})
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "scope_ready"

        # generate_master_plan (adapter, two-phase: → master_plan_drafting → master_plan_sharpening)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({
                "phases": [{"phase_id": "phase_001", "name": "Setup"}],
                "plan": "Build a task manager",
            }),
        )
        resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "master_plan_sharpening"

        # sharpen_plan (adapter, iterates within master_plan_sharpening)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"plan": "Sharpened task manager plan"}),
        )
        resp = client.post("/api/v1/actions/sharpen_plan", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "master_plan_sharpening"

        # accept_master_plan
        store = FileStore(".")
        store.write_json("phase-queue.json", {
            "schema_version": 1,
            "phases": [{"phase_id": "phase_001", "name": "Setup", "status": "upcoming"}],
        })
        resp = client.post("/api/v1/actions/accept_master_plan")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_queue_ready"

        # start_next_phase
        resp = client.post("/api/v1/actions/start_next_phase")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_in_progress"

        # generate_phase_plan (adapter, two-phase)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"plan": "Implement Setup phase"}),
        )
        resp = client.post("/api/v1/actions/generate_phase_plan", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "phase_sharpening"

        # accept_phase_plan
        resp = client.post("/api/v1/actions/accept_phase_plan")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_ready_to_build"

        # Verify state persists correctly (simulate restart)
        state_resp = client.get("/api/v1/state")
        assert state_resp.status_code == 200
        assert state_resp.json()["current_phase_state"] == "phase_ready_to_build"

        # start_building (adapter, two-phase: → phase_building → phase_reviewing)
        store = FileStore(".")
        store.write_json("handoff-phase_001.json", {
            "schema_version": 1,
            "handoff": "Phase setup complete",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Build complete"}),
        )
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "phase_reviewing"

        # accept_review
        resp = client.post("/api/v1/actions/accept_review")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_testing"

        # accept_test_results
        store = FileStore(".")
        store.write_json("review-findings-phase_001.json", {
            "schema_version": 1,
            "findings": "Build looks good",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        store.write_json("test-results-phase_001.json", {
            "schema_version": 1,
            "results": "All tests pass",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        resp = client.post("/api/v1/actions/accept_test_results")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_handoff"

        # generate_handoff (adapter, two-phase)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"handoff": "Phase complete"}),
        )
        resp = client.post("/api/v1/actions/generate_handoff", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "phase_handoff"

        # accept_handoff → phase_complete, project completes (only phase)
        resp = client.post("/api/v1/actions/accept_handoff")
        assert resp.status_code == 200
        assert resp.json()["new_state"] == "phase_complete"
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "project_complete"
        assert state_resp.json()["current_phase_state"] is None
        assert state_resp.json()["phases_complete"] == 1

    def test_existing_app_golden_path(self, mock_adapter):
        """Existing app through one complete phase."""
        temp_dir = tempfile.mkdtemp()
        try:
            repo_path = Path(temp_dir)
            (repo_path / "package.json").write_text('{"name": "test"}')
            (repo_path / "src").mkdir()
            (repo_path / "src" / "index.ts").write_text("// test")
            (repo_path / "tests").mkdir()

            # Override state to use temp directory
            store = FileStore(".")
            store.write_json("current-state.json", {
                "schema_version": 1,
                "project_display_name": "Test App",
                "repo_path": str(repo_path.resolve()),
                "mode": "existing_app",
                "project_state": "starting",
                "current_phase_id": None,
                "current_phase_state": None,
                "total_phases": 0,
                "phases_complete": 0,
                "adapter": "opencode",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

            mock_adapter.result = AdapterResult(
                success=True, outcome="succeeded",
                output_text=json.dumps({
                    "repo_path": str(repo_path.resolve()),
                    "framework": "typescript",
                    "directory_structure": ["src/", "tests/"],
                    "entry_points": ["src/index.ts"],
                    "dependencies": [],
                    "test_frameworks": ["jest"],
                    "generated_at": "2026-01-01T00:00:00Z",
                }),
            )
            resp = client.post("/api/v1/actions/load_existing_project", json={"confirmed": True})
            assert resp.status_code == 200, resp.json()
            assert resp.json()["new_state"] == "scope_ready"

            # Verify audit artifact
            store = FileStore(".")
            audit = store.read_json("audit.json")
            assert audit is not None
            assert audit["framework"] == "typescript"
            assert "directory_structure" in audit
            assert "entry_points" in audit
            assert "dependencies" in audit
            assert "test_frameworks" in audit
            assert "generated_at" in audit

            store.write_json("scope.json", {
                "schema_version": 1,
                "content": "Add authentication feature",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

            resp = client.post("/api/v1/actions/edit_scope",
                               json={"scope_content": "Add authentication feature"})
            assert resp.status_code == 200

            mock_adapter.result = AdapterResult(
                success=True, outcome="succeeded",
                output_text=json.dumps({
                    "phases": [{"phase_id": "phase_001", "name": "Auth Setup"}],
                    "plan": "Implement auth",
                }),
            )
            resp = client.post("/api/v1/actions/generate_master_plan", json={"confirmed": True})
            assert resp.status_code == 200, resp.json()
            assert resp.json()["new_state"] == "master_plan_sharpening"

            store.write_json("phase-queue.json", {
                "schema_version": 1,
                "phases": [{"phase_id": "phase_001", "name": "Auth Setup", "status": "upcoming"}],
            })
            resp = client.post("/api/v1/actions/accept_master_plan")
            assert resp.status_code == 200

            resp = client.post("/api/v1/actions/start_next_phase")
            assert resp.status_code == 200

            mock_adapter.result = AdapterResult(
                success=True, outcome="succeeded",
                output_text=json.dumps({"plan": "Implement auth phase"}),
            )
            resp = client.post("/api/v1/actions/generate_phase_plan", json={"confirmed": True})
            assert resp.status_code == 200, resp.json()

            resp = client.post("/api/v1/actions/accept_phase_plan")
            assert resp.status_code == 200

            store = FileStore(".")
            store.write_json("handoff-phase_001.json", {
                "schema_version": 1,
                "handoff": "Prior handoff",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            mock_adapter.result = AdapterResult(
                success=True, outcome="succeeded",
                output_text=json.dumps({"summary": "Build complete"}),
            )
            resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
            assert resp.status_code == 200, resp.json()

            store = FileStore(".")
            store.write_json("review-findings-phase_001.json", {
                "schema_version": 1,
                "findings": "Build looks good",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            store.write_json("test-results-phase_001.json", {
                "schema_version": 1,
                "results": "All tests pass",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
            resp = client.post("/api/v1/actions/accept_review")
            assert resp.status_code == 200

            resp = client.post("/api/v1/actions/accept_test_results")
            assert resp.status_code == 200

            mock_adapter.result = AdapterResult(
                success=True, outcome="succeeded",
                output_text=json.dumps({"handoff": "Auth phase done"}),
            )
            resp = client.post("/api/v1/actions/generate_handoff", json={"confirmed": True})
            assert resp.status_code == 200, resp.json()

            resp = client.post("/api/v1/actions/accept_handoff")
            assert resp.status_code == 200
            assert resp.json()["new_state"] == "phase_complete"
        finally:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)

    def test_interrupted_run_recovery(self, mock_adapter):
        """Detect interrupted run and verify recovery prompt."""
        _setup_scope_ready()

        # Manually create a RunRecord with status=running
        run_store = RunStore(".")
        run = run_store.create_run("generate_master_plan")
        run_store.start_run(run.run_id)

        # Simulate startup interrupt
        interrupted = run_store.interrupt_running_runs()
        assert len(interrupted) >= 1
        assert interrupted[0].status == "interrupted"

        # State unchanged
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "scope_ready"

        # GET /api/v1/runs/active returns the interrupted run
        active_resp = client.get("/api/v1/runs/active")
        active = active_resp.json().get("active")
        assert active is not None
        assert active["status"] == "interrupted"

    def test_approval_gate(self, mock_adapter):
        """Approval blocks risky actions, confirmed proceeds."""
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

        # Without confirmation → needs_approval
        resp = client.post("/api/v1/actions/start_building")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "needs_approval"
        assert data["risk_category"] == "modify_files"
        assert data["state_unchanged"] is True

        # State unchanged
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["current_phase_state"] == "phase_ready_to_build"

        # With confirmation → adapter called, state transitions
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({"summary": "Build done"}),
        )
        resp = client.post("/api/v1/actions/start_building", json={"confirmed": True})
        assert resp.status_code == 200, resp.json()
        assert resp.json()["new_state"] == "phase_reviewing"

        # Verify adapter was called
        assert len(mock_adapter.calls) >= 1
        last_call = mock_adapter.calls[-1]
        assert last_call["action"] == "start_building"

    def test_invalid_transition_rejected(self):
        """Invalid transition returns 400 with clear error."""
        _setup_scope_ready()
        # accept_master_plan is invalid from scope_ready
        resp = client.post("/api/v1/actions/accept_master_plan")
        assert resp.status_code == 400
        data = resp.json()
        assert data["error_code"] == "INVALID_TRANSITION"
        assert len(data["message"]) > 0
        assert len(data.get("suggested_action", "")) > 0

        # State unchanged
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "scope_ready"

    def test_adapter_action_unavailable_in_phase1(self, mock_adapter):
        """When no adapter is configured, adapter actions return adapter_not_available."""
        _setup_scope_ready()

        # Remove the registered adapter
        from services.orchestrator.services import action_service
        action_service.set_default_adapter(None)

        resp = client.post("/api/v1/actions/generate_master_plan")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "adapter_not_available"

        # State unchanged — no RunRecord created
        state_resp = client.get("/api/v1/state")
        assert state_resp.json()["project_state"] == "scope_ready"

        # Re-register MockAdapter for subsequent tests
        action_service.set_default_adapter(mock_adapter)
