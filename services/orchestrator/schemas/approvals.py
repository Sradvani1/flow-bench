from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ApprovalRecord(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    approval_id: str
    action: str
    action_description: str
    risk_category: Optional[str] = None
    risk_explanation: Optional[str] = None
    status: str
    confirmed_at: Optional[datetime] = None
    created_at: datetime
