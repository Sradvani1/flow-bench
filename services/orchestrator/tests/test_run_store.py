from pathlib import Path

import pytest

from services.orchestrator.store.run_store import RunStore


@pytest.fixture
def store(temp_repo):
    return RunStore(temp_repo)


class TestRunStore:
    def test_create_run(self, store):
        run = store.create_run("build_phase", phase_id="phase_001")
        assert run.run_id is not None
        assert run.action == "build_phase"
        assert run.phase_id == "phase_001"
        assert run.status == "queued"
        assert isinstance(run.run_id, str)
        assert len(run.run_id) == 26

    def test_create_run_no_phase(self, store):
        run = store.create_run("generate_master_plan")
        assert run.phase_id is None

    def test_single_active_run_lock(self, store):
        store.create_run("build_phase")
        with pytest.raises(RuntimeError, match="already active"):
            store.create_run("another_action")

    def test_start_run(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        stored = store.get_run(run.run_id)
        assert stored.status == "running"

    def test_start_run_invalid_status(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        with pytest.raises(RuntimeError):
            store.start_run(run.run_id)

    def test_complete_run_succeeded(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        store.complete_run(
            run.run_id,
            status="succeeded",
            output_artifact_path="build-summary-phase_001.json",
        )
        stored = store.get_run(run.run_id)
        assert stored.status == "succeeded"
        assert stored.finished_at is not None
        assert stored.output_artifact_path == "build-summary-phase_001.json"

    def test_complete_run_failed(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        store.complete_run(
            run.run_id,
            status="failed",
            failure_message="Build failed",
            recovery_message="Check logs and retry",
        )
        stored = store.get_run(run.run_id)
        assert stored.status == "failed"
        assert stored.failure_message == "Build failed"
        assert stored.recovery_message is not None

    def test_complete_run_invalid_status(self, store):
        run = store.create_run("build_phase")
        with pytest.raises(ValueError):
            store.complete_run(run.run_id, status="invalid")

    def test_get_active_run_queued(self, store):
        run = store.create_run("build_phase")
        active = store.get_active_run()
        assert active is not None
        assert active.run_id == run.run_id

    def test_get_active_run_none(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        store.complete_run(run.run_id, status="succeeded")
        active = store.get_active_run()
        assert active is None

    def test_get_all_runs(self, store):
        r1 = store.create_run("action_1")
        store.start_run(r1.run_id)
        store.complete_run(r1.run_id, status="succeeded")
        r2 = store.create_run("action_2")
        store.start_run(r2.run_id)
        store.complete_run(r2.run_id, status="succeeded")
        runs = store.get_all_runs()
        assert len(runs) == 2

    def test_get_nonexistent_run(self, store):
        run = store.get_run("nonexistent")
        assert run is None

    def test_context_hash_deterministic(self, store):
        parts = {"scope": "Build an app", "plan": "Phase plan"}
        hash1 = store.compute_context_hash(parts)
        hash2 = store.compute_context_hash(parts)
        assert hash1 == hash2

    def test_context_hash_different(self, store):
        hash1 = store.compute_context_hash({"scope": "App A"})
        hash2 = store.compute_context_hash({"scope": "App B"})
        assert hash1 != hash2

    def test_interrupt_running_runs(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        interrupted = store.interrupt_running_runs()
        assert len(interrupted) == 1
        assert interrupted[0].status == "interrupted"
        stored = store.get_run(run.run_id)
        assert stored.status == "interrupted"

    def test_recovery_does_not_emit_event(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        store.interrupt_running_runs()
        event_log_path = Path(store.runs_dir).parent / "events.ndjson"
        if event_log_path.exists():
            with open(str(event_log_path)) as f:
                assert f.read() == ""

    def test_recovery_guidance_only(self, store):
        run = store.create_run("build_phase")
        store.start_run(run.run_id)
        interrupted = store.interrupt_running_runs()
        assert interrupted[0].recovery_message is not None
        assert "unexpectedly" in interrupted[0].recovery_message.lower()

    def test_run_id_format(self, store):
        run = store.create_run("test_action")
        assert len(run.run_id) == 26
        assert run.run_id.isascii()
        assert run.run_id.isalnum()

    def test_update_context(self, store):
        run = store.create_run("build_phase")
        store.update_context(run.run_id, {"scope": "content"})
        stored = store.get_run(run.run_id)
        assert stored.input_artifact_refs.get("scope") == "content"
        assert stored.command_context_hash is not None

    def test_start_nonexistent_run(self, store):
        with pytest.raises(ValueError, match="Run not found"):
            store.start_run("nonexistent")

    def test_corrupt_run_json_skipped(self, store):
        corrupt_path = store.runs_dir / "corrupt.json"
        with open(str(corrupt_path), "w") as f:
            f.write("not json")
        active = store.get_active_run()
        assert active is None
        run = store.get_run("corrupt")
        assert run is None
        runs = store.get_all_runs()
        assert runs == []

    def test_update_context_nonexistent(self, store):
        with pytest.raises(ValueError, match="Run not found"):
            store.update_context("nonexistent", {})
