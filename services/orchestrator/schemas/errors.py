from pydantic import BaseModel


class ErrorResponse(BaseModel):
    status: str = "error"
    message: str
    suggested_action: str
    error_code: str
