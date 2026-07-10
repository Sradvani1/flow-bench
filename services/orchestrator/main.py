from contextlib import asynccontextmanager

from fastapi import FastAPI

from services.orchestrator.api.actions import router as actions_router
from services.orchestrator.api.error_handlers import (
    general_error_handler,
    state_transition_error_handler,
)
from services.orchestrator.api.events import router as events_router
from services.orchestrator.api.runs import router as runs_router
from services.orchestrator.api.state import router as state_router
from services.orchestrator.engine.state_machine import StateTransitionError


@asynccontextmanager
async def lifespan(app: FastAPI):
    from services.orchestrator.store.run_store import RunStore
    store = RunStore(".")
    store.interrupt_running_runs()
    yield


app = FastAPI(
    title="FlowBench",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(state_router, prefix="/api/v1")
app.include_router(actions_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api/v1")

app.add_exception_handler(StateTransitionError, state_transition_error_handler)
app.add_exception_handler(Exception, general_error_handler)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}
