from typing import Optional

from pydantic import BaseModel, Field


class AdapterResult(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    success: bool
    outcome: str = "succeeded"  # "succeeded" | "failed" | "timed_out"
    output_text: str
    artifact_path: Optional[str] = None
    suggested_next_action: Optional[str] = None
