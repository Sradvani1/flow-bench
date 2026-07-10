import json
from pathlib import Path
from typing import Optional


class EventLog:
    def __init__(self, repo_path: str):
        self.path = Path(repo_path).resolve() / ".flowbench" / "events.ndjson"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, event: dict) -> str:
        line = json.dumps(event, separators=(",", ":"), default=str) + "\n"
        with open(str(self.path), "a") as f:
            f.write(line)
            f.flush()
        return line.strip()

    def read_all(self) -> list[dict]:
        if not self.path.exists():
            return []
        events = []
        with open(str(self.path), "r") as f:
            for line in f:
                line = line.strip()
                if line:
                    events.append(json.loads(line))
        events.reverse()
        return events

    def read_paginated(
        self, offset: int = 0, limit: int = 50, level: Optional[str] = None
    ) -> tuple[list[dict], int]:
        all_events = self.read_all()
        if level:
            filtered = [e for e in all_events if e.get("level") == level]
        else:
            filtered = all_events
        total = len(filtered)
        page = filtered[offset : offset + limit]
        return page, total

    def count(self) -> int:
        if not self.path.exists():
            return 0
        count = 0
        with open(str(self.path), "r") as f:
            for _ in f:
                count += 1
        return count
