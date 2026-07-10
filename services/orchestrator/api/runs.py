from fastapi import APIRouter

from services.orchestrator.schemas.errors import ErrorResponse
from services.orchestrator.store.run_store import RunStore

router = APIRouter(tags=["runs"])


@router.get("/runs")
async def get_runs():
    store = RunStore(".")
    runs = store.get_all_runs()
    return {
        "runs": [r.model_dump(exclude_none=True) for r in runs],
        "total": len(runs),
    }


@router.get("/runs/active")
async def get_active_run():
    store = RunStore(".")
    active = store.get_active_run()
    if active is None:
        return {"status": "ok", "active": None}
    return {"status": "ok", "active": active.model_dump(exclude_none=True)}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    store = RunStore(".")
    run = store.get_run(run_id)
    if run is None:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                message=(
                    "No run record found with that ID. It may have been deleted or may not exist."
                ),
                suggested_action=(
                    "Check the run ID and try again, or view all runs to find the correct one."
                ),
                error_code="RUN_NOT_FOUND",
            ).model_dump(),
        )
    return run.model_dump(exclude_none=True)
