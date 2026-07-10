import pytest

from services.orchestrator.store.event_log import EventLog


@pytest.fixture
def event_log(temp_repo):
    return EventLog(temp_repo)


class TestEventLog:
    def test_count_empty(self, event_log):
        assert event_log.count() == 0

    def test_append_and_count(self, event_log):
        event_log.append({"event": "test", "level": "project"})
        assert event_log.count() == 1

    def test_read_all_empty(self, event_log):
        assert event_log.read_all() == []

    def test_read_all_returns_most_recent_first(self, event_log):
        event_log.append({"event": "first"})
        event_log.append({"event": "second"})
        events = event_log.read_all()
        assert len(events) == 2
        assert events[0]["event"] == "second"
        assert events[1]["event"] == "first"

    def test_read_paginated(self, event_log):
        for i in range(10):
            event_log.append({"event": f"e{i}", "level": "project"})
        page, total = event_log.read_paginated(offset=0, limit=3)
        assert len(page) == 3
        assert total == 10

    def test_read_paginated_filter_level(self, event_log):
        event_log.append({"event": "p1", "level": "project"})
        event_log.append({"event": "p2", "level": "phase"})
        page, total = event_log.read_paginated(level="project")
        assert total == 1
        assert page[0]["event"] == "p1"
