def scope_has_content(context: dict) -> bool:
    scope = context.get("scope", "")
    return bool(scope and scope.strip())


def next_phase_exists(context: dict) -> bool:
    phase_queue = context.get("phase_queue", [])
    return any(item.get("status") == "upcoming" for item in phase_queue)


def has_upcoming_phases(context: dict) -> bool:
    phase_queue = context.get("phase_queue", [])
    return sum(1 for item in phase_queue if item.get("status") == "upcoming") >= 2


def all_phases_complete(context: dict) -> bool:
    phase_queue = context.get("phase_queue", [])
    if not phase_queue:
        return False
    return all(item.get("status") == "complete" for item in phase_queue)
