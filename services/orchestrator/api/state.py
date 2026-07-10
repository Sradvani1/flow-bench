from fastapi import APIRouter

from services.orchestrator.store.file_store import FileStore

router = APIRouter(tags=["state"])


@router.get("/state")
async def get_state():
    store = FileStore(".")
    data = store.read_json("current-state.json")
    if data is None:
        return {
            "status": "no_project",
            "message": "No project is set up yet.",
        }
    return data
