from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EventLogEntry(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    timestamp: datetime
    level: str
    event: str
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    actor: str
    description: str
    phase_id: Optional[str] = None
    artifact_type: Optional[str] = None
