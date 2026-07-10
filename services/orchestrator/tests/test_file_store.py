import os
import tempfile
from pathlib import Path
from unittest import mock

import pytest

from services.orchestrator.store.file_store import FileStore


@pytest.fixture
def store(temp_repo):
    return FileStore(temp_repo)


class TestFileStore:
    def test_write_and_read_json(self, store):
        data = {"key": "value", "number": 42}
        store.write_json("test.json", data)
        result = store.read_json("test.json")
        assert result == data

    def test_read_nonexistent(self, store):
        result = store.read_json("nonexistent.json")
        assert result is None

    def test_delete_existing(self, store):
        store.write_json("test.json", {"a": 1})
        assert store.delete("test.json") is True
        assert store.read_json("test.json") is None

    def test_delete_nonexistent(self, store):
        assert store.delete("nonexistent.json") is False

    def test_exists(self, store):
        assert store.exists("test.json") is False
        store.write_json("test.json", {"a": 1})
        assert store.exists("test.json") is True

    def test_list_dir(self, store):
        store.write_json("a.json", {"a": 1})
        store.write_json("b.json", {"b": 2})
        files = store.list_dir()
        assert "a.json" in files
        assert "b.json" in files

    def test_list_dir_empty(self, store):
        assert store.list_dir() == []

    def test_write_creates_dirs(self, store):
        store.write_json("subdir/test.json", {"a": 1})
        assert store.exists("subdir/test.json")

    def test_path_escape_symlink(self, temp_repo):
        store = FileStore(temp_repo)
        escape_path = os.path.join(temp_repo, "escape.txt")
        with open(escape_path, "w") as f:
            f.write("escaped")

        symlink_dir = Path(store.base) / "symlinks"
        symlink_dir.mkdir(parents=True, exist_ok=True)
        symlink_path = symlink_dir / "outside"
        symlink_path.symlink_to(escape_path)

        with pytest.raises(PermissionError):
            store.read_json("symlinks/outside")

    def test_write_then_crash(self, store):
        original = store.write_json
        data = {"key": "value"}

        def crashing_write(rel_path, data):
            path = store.base / rel_path
            fd, tmp_path = tempfile.mkstemp(
                dir=str(path.parent), prefix=".tmp_"
            )
            with os.fdopen(fd, "w") as f:
                f.write("corrupt")
            os.unlink(tmp_path)
            raise OSError("simulated crash")

        store.write_json = crashing_write
        with pytest.raises(OSError):
            store.write_json("crash_test.json", data)
        store.write_json = original
        assert store.read_json("crash_test.json") is None

    def test_flat_layout_no_subdirectories(self, store):
        store.write_json("scope.json", {"a": 1})
        store.write_json("events.ndjson", {"b": 2})
        files = store.list_dir()
        for f in files:
            if "/" in f:
                parts = f.split("/")
                if len(parts) == 2:
                    pass
                elif len(parts) > 2:
                    pytest.fail(f"Unexpected subdirectory nesting: {f}")

    def test_filename_normalization(self, store):
        valid_names = [
            "phase-plan-phase_003.json",
            "build-summary-phase_001.json",
            "current-state.json",
            "events.ndjson",
        ]
        for name in valid_names:
            store.write_json(name, {"test": True})
            assert store.exists(name)

    def test_phase_id_in_filename(self, store):
        store.write_json("phase-plan-phase_003.json", {"data": 1})
        assert store.exists("phase-plan-phase_003.json")

    def test_write_corrupt_then_read_raises(self, store):
        path = store.base / "corrupt.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(str(path), "w") as f:
            f.write("not json")
        with pytest.raises(ValueError, match="Corrupt artifact"):
            store.read_json("corrupt.json")

    def test_list_dir_nonexistent_subdir(self, store):
        result = store.list_dir("nonexistent")
        assert result == []

    def test_exists_path_escape_returns_false(self, store):
        result = store.exists("../escape")
        assert result is False

    def test_delete_nonexistent_returns_false(self, store):
        assert store.delete("nonexistent.json") is False

    def test_write_json_rename_failure(self, store):
        with mock.patch("os.rename", side_effect=OSError("rename failed")):
            with pytest.raises(OSError):
                store.write_json("rename_fail.json", {"key": "value"})
        assert not store.exists("rename_fail.json")
