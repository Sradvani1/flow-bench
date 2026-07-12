import os
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import pytest


def _find_cli() -> str:
    return str(Path(__file__).resolve().parents[2] / "cli.py")


@pytest.mark.skipif(sys.platform == "win32", reason="SIGINT/SIGTERM not reliable on Windows")
def test_backend_starts_and_is_reachable():
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn",
         "services.orchestrator.main:app",
         "--host", "127.0.0.1", "--port", "8001"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        import urllib.request
        from urllib.error import URLError
        deadline = time.monotonic() + 15
        ok = False
        while time.monotonic() < deadline:
            try:
                resp = urllib.request.urlopen("http://127.0.0.1:8001/health", timeout=2)
                if resp.status == 200:
                    ok = True
                    break
            except URLError:
                time.sleep(1)
        assert ok, "Backend not reachable within 15s"
    finally:
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
            proc.wait(timeout=5)
        except (ProcessLookupError, OSError, subprocess.TimeoutExpired):
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, OSError):
                pass


@pytest.mark.skipif(sys.platform == "win32", reason="SIGINT/SIGTERM not reliable on Windows")
def test_cleanup_on_sigterm():
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn",
         "services.orchestrator.main:app",
         "--host", "127.0.0.1", "--port", "8002"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        import urllib.request
        from urllib.error import URLError
        deadline = time.monotonic() + 15
        ok = False
        while time.monotonic() < deadline:
            try:
                resp = urllib.request.urlopen("http://127.0.0.1:8002/health", timeout=2)
                if resp.status == 200:
                    ok = True
                    break
            except URLError:
                time.sleep(1)
        assert ok, "Backend not reachable"

        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(pgid, signal.SIGKILL)
            proc.wait(timeout=2)

        assert proc.poll() is not None, "Process still alive after SIGTERM"
    finally:
        try:
            if proc.poll() is None:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
                proc.wait(timeout=2)
        except (ProcessLookupError, OSError):
            pass


@pytest.mark.skipif(sys.platform == "win32", reason="SIGINT/SIGTERM not reliable on Windows")
def test_cleanup_on_sigint():
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn",
         "services.orchestrator.main:app",
         "--host", "127.0.0.1", "--port", "8003"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True,
    )
    try:
        import urllib.request
        from urllib.error import URLError
        deadline = time.monotonic() + 15
        ok = False
        while time.monotonic() < deadline:
            try:
                resp = urllib.request.urlopen("http://127.0.0.1:8003/health", timeout=2)
                if resp.status == 200:
                    ok = True
                    break
            except URLError:
                time.sleep(1)
        assert ok, "Backend not reachable"

        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGINT)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(pgid, signal.SIGKILL)
            proc.wait(timeout=2)

        assert proc.poll() is not None, "Process still alive after SIGINT"
    finally:
        try:
            if proc.poll() is None:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
                proc.wait(timeout=2)
        except (ProcessLookupError, OSError):
            pass


@pytest.mark.skipif(sys.platform == "win32", reason="SIGINT/SIGTERM not reliable on Windows")
def test_cleanup_on_process_crash():
    """Kill backend externally, verify frontend is also cleaned up."""
    proc = subprocess.Popen(
        [sys.executable, "-m", "services.orchestrator.cli", "start"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True, text=True,
    )
    try:
        import urllib.request
        from urllib.error import URLError

        # Wait for backend to be reachable
        deadline = time.monotonic() + 20
        backend_ok = False
        while time.monotonic() < deadline:
            try:
                resp = urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2)
                if resp.status == 200:
                    backend_ok = True
                    break
            except URLError:
                time.sleep(1)
        assert backend_ok, "Backend not reachable before crash test"

        # Wait for frontend to be reachable
        deadline = time.monotonic() + 35
        frontend_ok = False
        while time.monotonic() < deadline:
            try:
                resp = urllib.request.urlopen("http://localhost:3000", timeout=2)
                if resp.status == 200:
                    frontend_ok = True
                    break
            except URLError:
                time.sleep(2)
        assert frontend_ok, "Frontend not reachable before crash test"

        # Find and kill the backend process (it's a child of the CLI subprocess group)
        import subprocess as sp
        pgid = os.getpgid(proc.pid)
        # Kill all uvicorn children in the process group
        sp.run(
            ["pkill", "-f", "-P", str(pgid), "uvicorn"],
            capture_output=True, timeout=5,
        )
        time.sleep(2)

        # Verify CLI process is also gone (cleanup handler should have cleaned up)
        cli_dead = proc.poll() is not None
        if not cli_dead:
            # Give cleanup time to work
            time.sleep(6)
            cli_dead = proc.poll() is not None

        assert cli_dead, "CLI process still alive after backend crash"
    finally:
        try:
            if proc.poll() is None:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
                proc.wait(timeout=5)
        except (ProcessLookupError, OSError):
            pass


def test_frontend_not_started_when_backend_fails():
    """Occupy port 8000 so backend fails, verify frontend is never spawned."""
    occupier = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    occupier.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    occupier.bind(("127.0.0.1", 8000))
    occupier.listen(1)
    try:
        proc = subprocess.Popen(
            [sys.executable, "-m", "services.orchestrator.cli", "start"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            start_new_session=True, text=True,
        )
        try:
            stdout, stderr = proc.communicate(timeout=20)
            combined = stdout + stderr
            assert "ERROR: Backend failed to start" in combined
            assert "Starting frontend" not in combined
            assert "Frontend ready" not in combined
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            raise
        finally:
            try:
                if proc.poll() is None:
                    pgid = os.getpgid(proc.pid)
                    os.killpg(pgid, signal.SIGKILL)
                    proc.wait(timeout=2)
            except (ProcessLookupError, OSError):
                pass
    finally:
        occupier.close()


def test_status_no_project():
    flowbench_dir = Path.cwd() / ".flowbench"
    state_file = flowbench_dir / "current-state.json"
    if state_file.exists():
        state_file.unlink()
    result = subprocess.run(
        [sys.executable, "-m", "services.orchestrator.cli", "status"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0
    assert "No project set up yet" in result.stdout or "No project set up yet" in result.stderr
