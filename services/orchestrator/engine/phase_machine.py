from services.orchestrator.engine.state_machine import StateMachine


def create_phase_machine(transitions: dict) -> StateMachine:
    return StateMachine(transitions.get("phase_machine", {}).get("states", {}))
