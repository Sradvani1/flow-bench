import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from services.orchestrator.engine.guards import (
    all_phases_complete,
    has_upcoming_phases,
    next_phase_exists,
    scope_has_content,
)
from services.orchestrator.engine.phase_machine import create_phase_machine
from services.orchestrator.engine.project_machine import create_project_machine
from services.orchestrator.engine.state_machine import StateTransitionError
from services.orchestrator.schemas.errors import ErrorResponse
from services.orchestrator.schemas.state import CurrentState
from services.orchestrator.store.event_log import EventLog
from services.orchestrator.store.file_store import FileStore

router = APIRouter(tags=["actions"])

GUARD_MAP = {
    "scope_has_content": scope_has_content,
    "next_phase_exists": next_phase_exists,
    "has_upcoming_phases": has_upcoming_phases,
    "all_phases_complete": all_phases_complete,
}


def _load_config() -> dict:
    config_path = Path(__file__).parents[3] / "config" / "workflows.json"
    with open(str(config_path), "r") as f:
        return json.load(f)


def _load_actions_config() -> dict:
    config_path = Path(__file__).parents[3] / "config" / "actions.json"
    with open(str(config_path), "r") as f:
        return json.load(f)


@router.get("/actions")
async def get_actions():
    config = _load_config()
    actions_config = _load_actions_config()

    store = FileStore(".")
    state_data = store.read_json("current-state.json")
    if state_data is None:
        return []

    current_state = state_data.get("project_state")
    phase_state = state_data.get("current_phase_state")

    available = []
    if phase_state:
        phase_machine = create_phase_machine(config)
        for action_info in phase_machine.get_valid_actions(phase_state):
            action_name = action_info["action"]
            entry = actions_config.get(action_name, {})
            available.append({
                "action": action_name,
                "label": entry.get("label", action_name),
                "description": entry.get("description", ""),
                "risk_category": entry.get("risk_category"),
                "risk_explanation": entry.get("risk_explanation"),
                "action_type": entry.get("action_type", action_info["action_type"]),
                "enabled": True,
            })
    else:
        project_machine = create_project_machine(config)
        for action_info in project_machine.get_valid_actions(current_state):
            action_name = action_info["action"]
            entry = actions_config.get(action_name, {})
            available.append({
                "action": action_name,
                "label": entry.get("label", action_name),
                "description": entry.get("description", ""),
                "risk_category": entry.get("risk_category"),
                "risk_explanation": entry.get("risk_explanation"),
                "action_type": entry.get("action_type", action_info["action_type"]),
                "enabled": True,
            })

    return available


class ActionRequest(BaseModel):
    scope_content: Optional[str] = None
    repo_path: Optional[str] = None


@router.post("/actions/{action}")
async def post_action(action: str, body: Optional[ActionRequest] = None):
    config = _load_config()
    actions_config = _load_actions_config()
    store = FileStore(".")
    event_log = EventLog(".")

    action_entry = actions_config.get(action)
    if action_entry is None:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                message=f"Unknown action '{action}'.",
                suggested_action="Check the available actions and try again.",
                error_code="UNKNOWN_ACTION",
            ).model_dump(),
        )

    action_type = action_entry.get("action_type")

    if action_type == "adapter":
        return {
            "status": "adapter_not_available",
            "message": (
                "This step needs an execution tool "
                "that is not available in this setup yet."
            ),
            "action": action,
            "state_unchanged": True,
        }

    # Navigation actions: return 200 with same state, no side effects
    if action_type == "navigation":
        return {
            "status": "ok",
            "message": action_entry.get("label", action) + " requested.",
        }

    # System actions
    state_data = store.read_json("current-state.json")
    if state_data is None:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                message=(
                    "No project is set up yet. "
                    "Start a new project or load an existing one to begin."
                ),
                suggested_action=(
                    "Use 'Start new project' or 'Load existing app' to get started."
                ),
                error_code="NO_PROJECT",
            ).model_dump(),
        )

    current_state_obj = CurrentState(**state_data)
    current_project_state = current_state_obj.project_state
    current_phase_state = current_state_obj.current_phase_state

    # Build context for guards
    context = {}
    try:
        scope_data = store.read_json("scope.json")
        if scope_data:
            context["scope"] = scope_data.get("content", "")
    except ValueError:
        pass
    try:
        phase_queue = store.read_json("phase-queue.json")
        if phase_queue:
            context["phase_queue"] = phase_queue
    except ValueError:
        pass

    if current_phase_state:
        machine = create_phase_machine(config)
        level = "phase"
        current = current_phase_state
    else:
        machine = create_project_machine(config)
        level = "project"
        current = current_project_state

    guards = {k: v for k, v in GUARD_MAP.items()}

    try:
        new_state, events = machine.transition(current, action, guards, context)
    except StateTransitionError as e:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                message=e.message,
                suggested_action="Try one of the available actions listed in the command pane.",
                error_code="INVALID_TRANSITION",
            ).model_dump(),
        )

    # Handle special actions
    if action == "start_new_project":
        from services.orchestrator.schemas.artifacts import ScopeArtifact
        scope = ScopeArtifact(
            content=body.scope_content if body else "",
            updated_at=datetime.now(timezone.utc),
        )
        store.write_json("scope.json", json.loads(scope.model_dump_json()))
    elif action == "edit_scope":
        from services.orchestrator.schemas.artifacts import ScopeArtifact
        if body and body.scope_content is not None:
            scope_content = body.scope_content
        else:
            existing_scope = store.read_json("scope.json")
            scope_content = existing_scope.get("content", "") if existing_scope else ""
        scope = ScopeArtifact(
            content=scope_content,
            updated_at=datetime.now(timezone.utc),
        )
        store.write_json("scope.json", json.loads(scope.model_dump_json()))

    if level == "project":
        current_state_obj.project_state = new_state
        if new_state in ("scope_ready", "master_plan_sharpening",
                         "project_complete", "phase_queue_ready"):
            current_state_obj.current_phase_id = None
            current_state_obj.current_phase_state = None
    else:
        current_state_obj.current_phase_state = new_state

    current_state_obj.updated_at = datetime.now(timezone.utc)

    # Write event log if action produced events
    for evt in events:
        event_entry = {
            "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "event": evt["event"],
            "from_state": evt["from_state"],
            "to_state": evt["to_state"],
            "actor": "builder",
            "description": action_entry.get("label", action),
            "phase_id": current_state_obj.current_phase_id,
            "artifact_type": None,
        }
        event_log.append(event_entry)

    # Write updated state
    store.write_json(
        "current-state.json",
        json.loads(current_state_obj.model_dump_json())
    )

    return {
        "status": "ok",
        "new_state": new_state,
        "message": action_entry.get("label", action) + " completed.",
    }
