import shutil
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    from services.orchestrator.adapters.opencode import OpenCodeAdapter
    from services.orchestrator.services.action_service import set_default_adapter
    from services.orchestrator.store.run_store import RunStore

    set_default_adapter(OpenCodeAdapter())
    store = RunStore(".")
    store.interrupt_running_runs()
    yield


app = FastAPI(
    title="FlowBench",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(state_router, prefix="/api/v1")
app.include_router(actions_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(runs_router, prefix="/api/v1")

app.add_exception_handler(StateTransitionError, state_transition_error_handler)
app.add_exception_handler(Exception, general_error_handler)


@app.get("/health")
async def health():
    adapter_found = shutil.which("opencode") is not None
    return {
        "status": "ok",
        "version": "0.1.0",
        "adapter": {
            "name": "opencode",
            "available": adapter_found,
            "detail": None if adapter_found else "OpenCode CLI not found on PATH",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
