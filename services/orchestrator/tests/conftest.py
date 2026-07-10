import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def temp_repo():
    with tempfile.TemporaryDirectory() as td:
        repo_path = Path(td) / "test-repo"
        repo_path.mkdir(parents=True, exist_ok=True)
        yield str(repo_path)


@pytest.fixture
def sample_transitions():
    return {
        "project_machine": {
            "states": {
                "starting": {
                    "actions": {
                        "start_new_project": {
                            "target_state": "scope_ready",
                            "action_type": "system",
                            "guard": None,
                            "event": "project_created",
                        }
                    },
                    "events": {},
                },
                "scope_ready": {
                    "actions": {
                        "edit_scope": {
                            "target_state": "scope_ready",
                            "action_type": "system",
                            "guard": None,
                            "event": "scope_edited",
                        },
                        "generate_master_plan": {
                            "target_state": "master_plan_drafting",
                            "action_type": "adapter",
                            "guard": "scope_has_content",
                            "event": "master_plan_generation_started",
                        },
                        "cancel_project": {
                            "target_state": "project_complete",
                            "action_type": "system",
                            "guard": None,
                            "event": "project_cancelled",
                        },
                    },
                    "events": {},
                },
                "master_plan_drafting": {
                    "actions": {},
                    "events": {
                        "draft_complete": {
                            "target_state": "master_plan_sharpening"
                        },
                        "draft_failed": {
                            "target_state": "project_blocked"
                        },
                    },
                },
                "master_plan_sharpening": {
                    "actions": {
                        "accept_master_plan": {
                            "target_state": "phase_queue_ready",
                            "action_type": "system",
                            "guard": None,
                            "event": "master_plan_accepted",
                        },
                    },
                    "events": {},
                },
                "phase_queue_ready": {
                    "actions": {
                        "start_next_phase": {
                            "target_state": "phase_in_progress",
                            "action_type": "system",
                            "guard": "next_phase_exists",
                            "event": "phase_started",
                        },
                        "view_all_phases": {
                            "target_state": "phase_queue_ready",
                            "action_type": "navigation",
                            "guard": None,
                            "event": None,
                        },
                    },
                    "events": {
                        "all_phases_complete": {
                            "target_state": "project_complete"
                        },
                    },
                },
                "phase_in_progress": {
                    "actions": {},
                    "events": {},
                },
                "project_blocked": {
                    "actions": {
                        "replan_from_here": {
                            "target_state": "master_plan_sharpening",
                            "action_type": "system",
                            "guard": None,
                            "event": "project_replanned",
                        },
                    },
                    "events": {},
                },
                "project_complete": {
                    "actions": {
                        "view_summary": {
                            "target_state": "project_complete",
                            "action_type": "navigation",
                            "guard": None,
                            "event": None,
                        },
                        "archive_project": {
                            "target_state": "project_complete",
                            "action_type": "system",
                            "guard": None,
                            "event": "project_archived",
                        },
                    },
                    "events": {},
                },
            },
        },
        "phase_machine": {
            "states": {
                "phase_starting": {
                    "actions": {
                        "generate_phase_plan": {
                            "target_state": "phase_plan",
                            "action_type": "adapter",
                            "guard": None,
                            "event": "phase_plan_generation_started",
                        },
                        "skip_phase": {
                            "target_state": "phase_complete",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_skipped",
                        },
                    },
                    "events": {},
                },
                "phase_plan": {
                    "actions": {},
                    "events": {
                        "phase_draft_complete": {
                            "target_state": "phase_sharpening"
                        },
                    },
                },
                "phase_sharpening": {
                    "actions": {
                        "accept_phase_plan": {
                            "target_state": "phase_ready_to_build",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_plan_accepted",
                        },
                    },
                    "events": {},
                },
                "phase_ready_to_build": {
                    "actions": {
                        "change_phase_plan": {
                            "target_state": "phase_plan",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_plan_revision_started",
                        },
                    },
                    "events": {},
                },
                "phase_building": {
                    "actions": {
                        "pause": {
                            "target_state": "phase_blocked",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_build_paused",
                        },
                    },
                    "events": {
                        "build_complete": {
                            "target_state": "phase_reviewing"
                        },
                        "build_failed": {
                            "target_state": "phase_blocked"
                        },
                    },
                },
                "phase_reviewing": {
                    "actions": {
                        "accept_review": {
                            "target_state": "phase_testing",
                            "action_type": "system",
                            "guard": None,
                            "event": "review_accepted",
                        },
                    },
                    "events": {},
                },
                "phase_testing": {
                    "actions": {
                        "accept_test_results": {
                            "target_state": "phase_handoff",
                            "action_type": "system",
                            "guard": None,
                            "event": "tests_accepted",
                        },
                    },
                    "events": {},
                },
                "phase_fixing": {
                    "actions": {},
                    "events": {
                        "fix_complete": {
                            "target_state": "phase_reviewing"
                        },
                    },
                },
                "phase_handoff": {
                    "actions": {
                        "accept_handoff": {
                            "target_state": "phase_complete",
                            "action_type": "system",
                            "guard": None,
                            "event": "handoff_accepted",
                        },
                    },
                    "events": {},
                },
                "phase_complete": {
                    "actions": {
                        "start_next_phase": {
                            "target_state": "phase_queue_ready",
                            "action_type": "system",
                            "guard": "next_phase_exists",
                            "event": "next_phase_requested",
                        },
                        "view_handoff_notes": {
                            "target_state": "phase_complete",
                            "action_type": "navigation",
                            "guard": None,
                            "event": None,
                        },
                    },
                    "events": {},
                },
                "phase_blocked": {
                    "actions": {
                        "replan_phase": {
                            "target_state": "phase_plan",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_replanned",
                        },
                        "abandon_phase": {
                            "target_state": "phase_queue_ready",
                            "action_type": "system",
                            "guard": None,
                            "event": "phase_abandoned",
                        },
                    },
                    "events": {},
                },
            },
        },
    }
