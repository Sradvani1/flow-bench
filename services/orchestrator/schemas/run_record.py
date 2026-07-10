from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RunRecord(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    run_id: str
    action: str
    phase_id: Optional[str] = None
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str = Field(
        pattern=r"^(queued|running|succeeded|failed|timed_out|cancelled|interrupted)$"
    )
    input_artifact_refs: dict[str, str] = {}
    output_artifact_path: Optional[str] = None
    failure_message: Optional[str] = None
    recovery_message: Optional[str] = None
    template_version: Optional[str] = None
    working_directory: Optional[str] = None
    command_context_hash: Optional[str] = None
