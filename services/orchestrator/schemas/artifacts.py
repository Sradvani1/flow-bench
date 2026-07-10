from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ScopeArtifact(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    content: str = ""
    updated_at: datetime


class MasterPlan(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    project: str
    total_phases: int = 0
    phases: list[dict] = []
    architecture_decisions: list[str] = []
    generated_at: datetime


class SharpeningNotes(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    rounds: list[dict] = []
    updated_at: datetime


class PhasePlan(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    phase_name: str
    summary: str = ""
    sub_tasks: list[dict] = []
    success_criteria: list[str] = []
    estimated_complexity: str = "medium"
    dependencies: list[str] = []
    generated_at: datetime


class BuildSummary(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    status: str = "completed"
    files_created: list[str] = []
    files_modified: list[str] = []
    files_deleted: list[str] = []
    summary: str = ""
    completed_at: datetime


class ReviewFindings(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    findings: list[dict] = []
    summary: str = ""
    completed_at: datetime


class ResultsSchema(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    details: list[dict] = []
    summary: str = ""
    completed_at: datetime


class Handoff(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    phase_name: str = ""
    completed_tasks: list[str] = []
    unresolved_issues: list[str] = []
    next_phase_name: str = ""
    notes: str = ""
    generated_at: datetime


class DecisionArtifact(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    decision_id: str
    action: str
    reason: str
    phase_id: Optional[str] = None
    created_at: datetime


class AuditArtifact(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    repo_path: str
    framework: Optional[str] = None
    directory_structure: list[str] = []
    entry_points: list[str] = []
    dependencies: list[dict] = []
    test_frameworks: list[str] = []
    git_info: Optional[dict] = None
    generated_at: datetime
