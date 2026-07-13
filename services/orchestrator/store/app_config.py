import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional

_CONFIG_BASE_OVERRIDE: Optional[Path] = None


def set_config_base_override(path: Optional[Path]) -> None:
    global _CONFIG_BASE_OVERRIDE
    _CONFIG_BASE_OVERRIDE = path


def _config_base() -> Path:
    if _CONFIG_BASE_OVERRIDE is not None:
        return _CONFIG_BASE_OVERRIDE
    return Path(__file__).resolve().parents[2] / "config"


def read_app_config(name: str) -> Optional[dict[str, Any]]:
    path = _config_base() / name
    if not path.exists():
        return None
    try:
        with open(path, "r") as f:
            return json.load(f)
    except json.JSONDecodeError:
        raise ValueError(f"Corrupt config: {name} could not be parsed as JSON.")


def write_app_config(name: str, data: dict[str, Any]) -> str:
    base = _config_base()
    base.mkdir(parents=True, exist_ok=True)
    path = base / name
    content = json.dumps(data, indent=2, default=str)
    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp_", suffix=".json")
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
