from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from services.orchestrator.schemas.adapter import AdapterResult
from services.orchestrator.schemas.approvals import ApprovalRecord
from services.orchestrator.schemas.artifacts import (
    AuditArtifact,
    BuildSummary,
    DecisionArtifact,
    Handoff,
    MasterPlan,
    PhasePlan,
    ReviewFindings,
    ScopeArtifact,
    SharpeningNotes,
)
from services.orchestrator.schemas.artifacts import (
    ResultsSchema as TestResults,
)
from services.orchestrator.schemas.errors import ErrorResponse
from services.orchestrator.schemas.events import EventLogEntry
from services.orchestrator.schemas.run_record import RunRecord
from services.orchestrator.schemas.state import CurrentState, PhaseQueueItem


class TestCurrentState:
    def test_valid(self):
        state = CurrentState(
            project_display_name="Test App",
            repo_path="/tmp/test",
            project_state="starting",
            updated_at=datetime.now(timezone.utc),
        )
        assert state.schema_version == 1
        assert state.mode == "new_build"

    def test_schema_version_ge_1(self):
        with pytest.raises(ValidationError):
            CurrentState(
                project_display_name="Test",
                repo_path="/tmp/test",
                project_state="starting",
                schema_version=0,
                updated_at=datetime.now(timezone.utc),
            )

    def test_serialize_deserialize(self):
        state = CurrentState(
            project_display_name="Test",
            repo_path="/tmp/test",
            project_state="starting",
            updated_at=datetime.now(timezone.utc),
        )
        data = state.model_dump_json()
        restored = CurrentState.model_validate_json(data)
        assert restored.project_display_name == "Test"
        assert restored.schema_version == 1


class TestPhaseQueueItem:
    def test_valid(self):
        item = PhaseQueueItem(
            phase_id="phase_001",
            name="Foundation",
            status="upcoming",
        )
        assert item.schema_version == 1

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            PhaseQueueItem(
                phase_id="phase_001",
                name="Test",
                status="",
            )


class TestRunRecord:
    def test_valid(self):
        run = RunRecord(
            run_id="01J250ABCDEFGHIJKLMNOPQRST",
            action="build_phase",
            started_at=datetime.now(timezone.utc),
            status="queued",
        )
        assert run.schema_version == 1

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            RunRecord(
                run_id="01J250ABCDEFGHIJKLMNOPQRST",
                action="build_phase",
                started_at=datetime.now(timezone.utc),
                status="invalid",
            )

    def test_serialize_roundtrip(self):
        run = RunRecord(
            run_id="01J250ABCDEFGHIJKLMNOPQRST",
            action="build_phase",
            started_at=datetime.now(timezone.utc),
            status="queued",
        )
        data = run.model_dump_json(exclude_none=True)
        restored = RunRecord.model_validate_json(data)
        assert restored.run_id == run.run_id
        assert restored.status == run.status


class TestErrorResponse:
    def test_valid(self):
        err = ErrorResponse(
            message="Something went wrong",
            suggested_action="Try again",
            error_code="TEST_ERROR",
        )
        assert err.status == "error"
        assert err.message == "Something went wrong"


class TestApprovalRecord:
    def test_valid(self):
        rec = ApprovalRecord(
            approval_id="01J250GHIJKLMNOPQRSTUVWXYZ",
            action="start_building",
            action_description="Start building phase",
            status="pending",
            created_at=datetime.now(timezone.utc),
        )
        assert rec.schema_version == 1

    def test_with_risk(self):
        rec = ApprovalRecord(
            approval_id="01J250GHIJKLMNOPQRSTUVWXYZ",
            action="start_building",
            action_description="Start building",
            risk_category="modify_files",
            risk_explanation="This will modify files",
            status="confirmed",
            confirmed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        assert rec.risk_category == "modify_files"


class TestArtifacts:
    def test_scope_artifact(self):
        a = ScopeArtifact(content="Build a todo app", updated_at=datetime.now(timezone.utc))
        assert a.schema_version == 1

    def test_master_plan(self):
        a = MasterPlan(project="Test", generated_at=datetime.now(timezone.utc))
        assert a.total_phases == 0

    def test_sharpening_notes(self):
        a = SharpeningNotes(updated_at=datetime.now(timezone.utc))
        assert a.rounds == []

    def test_phase_plan(self):
        a = PhasePlan(
            phase_id="phase_001", phase_name="Test",
            generated_at=datetime.now(timezone.utc),
        )
        assert a.phase_id == "phase_001"

    def test_build_summary(self):
        a = BuildSummary(phase_id="phase_001", completed_at=datetime.now(timezone.utc))
        assert a.status == "completed"

    def test_review_findings(self):
        a = ReviewFindings(phase_id="phase_001", completed_at=datetime.now(timezone.utc))
        assert a.findings == []

    def test_test_results(self):
        a = TestResults(phase_id="phase_001", completed_at=datetime.now(timezone.utc))
        assert a.passed == 0

    def test_handoff(self):
        a = Handoff(phase_id="phase_001", generated_at=datetime.now(timezone.utc))
        assert a.phase_id == "phase_001"

    def test_decision_artifact(self):
        a = DecisionArtifact(
            decision_id="decision_001",
            action="skip_phase",
            reason="Not needed",
            created_at=datetime.now(timezone.utc),
        )
        assert a.decision_id == "decision_001"

    def test_audit_artifact(self):
        a = AuditArtifact(repo_path="/tmp/test", generated_at=datetime.now(timezone.utc))
        assert a.framework is None


class TestEventLogEntry:
    def test_valid(self):
        entry = EventLogEntry(
            timestamp=datetime.now(timezone.utc),
            level="project",
            event="transition",
            from_state="starting",
            to_state="scope_ready",
            actor="builder",
            description="Started a new project",
        )
        assert entry.schema_version == 1

    def test_with_phase(self):
        entry = EventLogEntry(
            timestamp=datetime.now(timezone.utc),
            level="phase",
            event="action",
            actor="system",
            description="Build started",
            phase_id="phase_001",
        )
        assert entry.phase_id == "phase_001"


class TestAdapterResult:
    def test_valid(self):
        result = AdapterResult(success=True, output_text="Done")
        assert result.schema_version == 1

    def test_failure(self):
        result = AdapterResult(success=False, output_text="Failed")
        assert not result.success
