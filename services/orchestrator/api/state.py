import re

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from services.orchestrator.engine.state_machine import PRODUCT_LABELS
from services.orchestrator.store.file_store import FileStore

router = APIRouter(tags=["state"])


def _safe_label(name: str) -> str:
    return name.replace("_", " ").title()


ALLOWED_ARTIFACTS = {
    "scope.json", "master-plan.json", "sharpening-notes.json",
    "phase-queue.json", "audit.json",
}


@router.get("/state")
async def get_state():
    store = FileStore(".")
    data = store.read_json("current-state.json")
    if data is None:
        return {
            "status": "no_project",
            "message": "No project is set up yet.",
        }
    project_state = data.get("project_state", "")
    data["project_state_label"] = PRODUCT_LABELS.get(
        project_state, _safe_label(project_state)
    )
    if data.get("current_phase_state"):
        phase_state = data["current_phase_state"]
        data["current_phase_state_label"] = PRODUCT_LABELS.get(
            phase_state, _safe_label(phase_state)
        )
    return data


@router.get("/phase-queue")
async def get_phase_queue():
    store = FileStore(".")
    data = store.read_json("phase-queue.json")
    if data is None:
        return {"phase_queue": [], "total": 0}
    items = data if isinstance(data, list) else data.get("phases", data)
    if isinstance(items, dict):
        items = []
    return {
        "phase_queue": items,
        "total": len(items),
    }


@router.get("/artifacts/{filename}")
async def get_artifact(filename: str):
    if filename in ALLOWED_ARTIFACTS:
        pass
    elif re.match(
        r"^(phase-plan|build-summary|review-findings|test-results|handoff|decision)-phase_\d{3}\.json$",
        filename,
    ):
        pass
    else:
        return JSONResponse(
            status_code=404, content={"error": "Artifact not found"}
        )
    store = FileStore(".")
    data = store.read_json(filename)
    if data is None:
        return JSONResponse(
            status_code=404, content={"error": "Artifact not found"}
        )
    return data
