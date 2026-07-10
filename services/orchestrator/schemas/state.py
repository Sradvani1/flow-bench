from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CurrentState(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    project_display_name: str
    repo_path: str
    mode: str = "new_build"
    project_state: str
    current_phase_id: Optional[str] = None
    current_phase_state: Optional[str] = None
    total_phases: int = 0
    phases_complete: int = 0
    adapter: str = "opencode"
    updated_at: datetime


class PhaseQueueItem(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str
    name: str
    status: str = Field(pattern=r"^(upcoming|in_progress|complete|blocked|skipped)$")
    skip_reason: Optional[str] = None
