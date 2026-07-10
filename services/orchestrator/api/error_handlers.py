from fastapi import Request
from fastapi.responses import JSONResponse

from services.orchestrator.engine.state_machine import StateTransitionError
from services.orchestrator.schemas.errors import ErrorResponse


async def state_transition_error_handler(
    request: Request, exc: StateTransitionError
) -> JSONResponse:
    resp = ErrorResponse(
        message=exc.message,
        suggested_action="Try one of the available actions listed in the command pane.",
        error_code="INVALID_TRANSITION",
    )
    return JSONResponse(
        status_code=400,
        content=resp.model_dump(),
    )


async def general_error_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    resp = ErrorResponse(
        message="An unexpected error occurred. Please check the server logs.",
        suggested_action="Check the server logs for details, then try again.",
        error_code="INTERNAL_ERROR",
    )
    return JSONResponse(
        status_code=500,
        content=resp.model_dump(),
    )
