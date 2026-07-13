import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import ulid

from services.orchestrator.schemas.run_record import RunRecord
from services.orchestrator.store.file_store import strip_sensitive


class RunStore:
    def __init__(self, repo_path: str):
        self.runs_dir = Path(repo_path).resolve() / ".flowbench" / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def _run_path(self, run_id: str) -> Path:
        return self.runs_dir / f"{run_id}.json"

    def create_run(self, action: str, phase_id: Optional[str] = None) -> RunRecord:
        active = self.get_active_run()
        if active is not None:
            raise RuntimeError(
                f"A run is already active (run_id={active.run_id}, "
                f"status={active.status}). Complete or cancel it first."
            )
        run = RunRecord(
            run_id=str(ulid.new()),
            action=action,
            phase_id=phase_id,
            started_at=datetime.now(timezone.utc),
            status="queued",
        )
        self._persist(run)
        return run

    def start_run(self, run_id: str):
        run = self.get_run(run_id)
        if run is None:
            raise ValueError(f"Run not found: {run_id}")
        if run.status != "queued":
            raise RuntimeError(
                f"Cannot start run {run_id}: status is '{run.status}', expected 'queued'."
            )
        run.status = "running"
        self._persist(run)

    def complete_run(
        self,
        run_id: str,
        status: str,
        finished_at: Optional[datetime] = None,
        failure_message: Optional[str] = None,
        recovery_message: Optional[str] = None,
        output_artifact_path: Optional[str] = None,
    ):
        terminal_statuses = {
            "succeeded", "failed", "timed_out", "cancelled", "interrupted"
        }
        if status not in terminal_statuses:
            raise ValueError(
                f"Invalid terminal status '{status}'. "
                f"Must be one of: {', '.join(sorted(terminal_statuses))}."
            )
        run = self.get_run(run_id)
        if run is None:
            # Fallback: scan runs dir for matching file (handles edge cases in path resolution)
            for path in self.runs_dir.glob("*.json"):
                if path.stem == run_id:
                    try:
                        with open(str(path), "r") as f:
                            run = RunRecord(**json.load(f))
                        break
                    except (json.JSONDecodeError, KeyError):
                        continue
        if run is None:
            raise ValueError(f"Run not found: {run_id}")
        run.status = status
        run.finished_at = finished_at or datetime.now(timezone.utc)
        if failure_message:
            run.failure_message = failure_message
        if recovery_message:
            run.recovery_message = recovery_message
        if output_artifact_path:
            run.output_artifact_path = output_artifact_path
        self._persist(run)

    def interrupt_running_runs(self) -> list[RunRecord]:
        interrupted = []
        for path in self.runs_dir.glob("*.json"):
            try:
                with open(str(path), "r") as f:
                    data = json.load(f)
                if data.get("status") == "running":
                    data["status"] = "interrupted"
                    data["finished_at"] = datetime.now(timezone.utc).isoformat()
                    data["recovery_message"] = (
                        "Work stopped unexpectedly. You can inspect the current state, "
                        "retry the last action, continue from where you are, "
                        "or revise the plan."
                    )
                    self._atomic_write_json(str(path), data)
                    interrupted.append(RunRecord(**data))
            except (json.JSONDecodeError, KeyError):
                continue
        return interrupted

    def get_active_run(self) -> Optional[RunRecord]:
        for path in self.runs_dir.glob("*.json"):
            try:
                with open(str(path), "r") as f:
                    data = json.load(f)
                if data.get("status") in ("queued", "running", "interrupted"):
                    return RunRecord(**data)
            except (json.JSONDecodeError, KeyError):
                continue
        return None

    def get_run(self, run_id: str) -> Optional[RunRecord]:
        path = self._run_path(run_id)
        if not path.exists():
            return None
        try:
            with open(str(path), "r") as f:
                return RunRecord(**json.load(f))
        except (json.JSONDecodeError, KeyError):
            return None

    def get_all_runs(self) -> list[RunRecord]:
        runs = []
        for path in sorted(self.runs_dir.glob("*.json"), reverse=True):
            try:
                with open(str(path), "r") as f:
                    runs.append(RunRecord(**json.load(f)))
            except (json.JSONDecodeError, KeyError):
                continue
        return runs

    def compute_context_hash(self, context_parts: dict[str, str]) -> str:
        sorted_keys = sorted(context_parts.keys())
        combined = "|".join(
            f"{k}={context_parts[k]}" for k in sorted_keys
        )
        return hashlib.sha256(combined.encode()).hexdigest()

    def update_context(self, run_id: str, context_parts: dict[str, str]):
        run = self.get_run(run_id)
        if run is None:
            raise ValueError(f"Run not found: {run_id}")
        run.input_artifact_refs.update(context_parts)
        run.command_context_hash = self.compute_context_hash(run.input_artifact_refs)
        self._persist(run)

    def _persist(self, run: RunRecord):
        path = self._run_path(run.run_id)
        data = json.loads(run.model_dump_json(exclude_none=True))
        data = strip_sensitive(data)
        self._atomic_write_json(str(path), data)

    def _atomic_write_json(self, path: str, data: dict):
        parent = Path(path).parent
        parent.mkdir(parents=True, exist_ok=True)
        content = json.dumps(data, indent=2, default=str)
        fd, tmp_path = tempfile.mkstemp(dir=str(parent), prefix=".tmp_", suffix=".json")
        try:
            with os.fdopen(fd, "w") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.rename(tmp_path, path)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
