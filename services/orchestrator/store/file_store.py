import json
import os
import tempfile
from pathlib import Path
from typing import Optional


class FileStore:
    def __init__(self, repo_path: str):
        self.base = Path(repo_path).resolve() / ".flowbench"
        self.base.mkdir(parents=True, exist_ok=True)

    def _validate_path(self, rel_path: str) -> Path:
        resolved = (self.base / rel_path).resolve()
        if not str(resolved).startswith(str(self.base)):
            raise PermissionError(
                f"Path escapes .flowbench/: {rel_path}"
            )
        parent = resolved.parent
        parent.mkdir(parents=True, exist_ok=True)
        return resolved

    def write_json(self, rel_path: str, data: dict) -> str:
        path = self._validate_path(rel_path)
        content = json.dumps(data, indent=2, default=str)
        fd, tmp_path = tempfile.mkstemp(
            dir=str(path.parent), prefix=".tmp_", suffix=".json"
        )
        try:
            with os.fdopen(fd, "w") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.rename(tmp_path, str(path))
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
        return str(path)

    def read_json(self, rel_path: str) -> Optional[dict]:
        path = self._validate_path(rel_path)
        if not path.exists():
            return None
        try:
            with open(str(path), "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            raise ValueError(
                f"Corrupt artifact: {rel_path} could not be parsed as JSON."
            )

    def delete(self, rel_path: str) -> bool:
        path = self._validate_path(rel_path)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_dir(self, rel_path: str = "") -> list[str]:
        path = self._validate_path(rel_path)
        if not path.exists():
            return []
        return sorted(
            str(p.relative_to(self.base))
            for p in path.iterdir()
        )

    def exists(self, rel_path: str) -> bool:
        try:
            return self._validate_path(rel_path).exists()
        except PermissionError:
            return False
