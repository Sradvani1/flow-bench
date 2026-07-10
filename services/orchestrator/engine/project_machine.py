from services.orchestrator.engine.state_machine import StateMachine


def create_project_machine(transitions: dict) -> StateMachine:
    return StateMachine(transitions.get("project_machine", {}).get("states", {}))
