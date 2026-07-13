import atexit
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import click

from services.orchestrator.store.file_store import FileStore

_HAS_UV = shutil.which("uv") is not None


@click.group()
def main():
    pass


def _wait_for_url(url: str, timeout: float, interval: float) -> bool:
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            req = Request(url, method="GET")
            urlopen(req, timeout=max(1.0, interval))
            return True
        except (URLError, OSError):
            time.sleep(interval)
    return False


def _start_backend() -> subprocess.Popen:
    if _HAS_UV:
        cmd = ["uv", "run", "python", "-m",
               "services.orchestrator.main"]
    else:
        cmd = [sys.executable, "-m",
               "services.orchestrator.main"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True,
        text=True,
    )
    return proc


def _start_frontend() -> subprocess.Popen:
    cwd = Path(__file__).resolve().parents[2] / "apps" / "web"
    proc = subprocess.Popen(
        ["pnpm", "run", "dev"],
        cwd=str(cwd),
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        start_new_session=True,
        text=True,
    )
    return proc


def _prefix_output(proc: subprocess.Popen, prefix: str):
    def _read(stream, out):
        for line in stream:
            out.write(f"[{prefix}] {line}")
            out.flush()

    threads = []
    if proc.stdout:
        t = threading.Thread(target=_read, args=(proc.stdout, sys.stdout), daemon=True)
        t.start()
        threads.append(t)
    if proc.stderr:
        t = threading.Thread(target=_read, args=(proc.stderr, sys.stderr), daemon=True)
        t.start()
        threads.append(t)
    proc.wait()
    for t in threads:
        t.join()


def _cleanup(*processes: subprocess.Popen) -> None:
    for proc in processes:
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError, OSError):
            pass
    for proc in processes:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                pgid = os.getpgid(proc.pid)
                os.killpg(pgid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError, OSError):
                pass
            proc.wait(timeout=2)


@main.command()
def start():
    """Start the FlowBench service (backend API + frontend dev server)."""
    processes = []

    def handle_exit(*_args):
        _cleanup(*processes)
        sys.exit(0)

    atexit.register(lambda: _cleanup(*processes))
    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    # 1. Backend
    click.echo("Starting backend...")
    backend = _start_backend()
    processes.append(backend)

    if _wait_for_url("http://127.0.0.1:8000/health", 15, 1):
        click.echo("Backend ready on http://127.0.0.1:8000")
    else:
        _cleanup(backend)
        stderr_lines = []
        if backend.stderr:
            stderr_lines = list(backend.stderr)[-10:]
        click.echo("ERROR: Backend failed to start", err=True)
        for line in stderr_lines:
            click.echo(f"  {line.rstrip()}", err=True)
        sys.exit(1)

    # 2. Frontend
    click.echo("Starting frontend...")
    frontend = _start_frontend()
    processes.append(frontend)

    if _wait_for_url("http://localhost:3000", 30, 2):
        click.echo("Frontend ready on http://localhost:3000")
    else:
        _cleanup(frontend)
        stderr_lines = []
        if frontend.stderr:
            stderr_lines = list(frontend.stderr)[-10:]
        click.echo("ERROR: Frontend failed to start", err=True)
        for line in stderr_lines:
            click.echo(f"  {line.rstrip()}", err=True)
        sys.exit(1)

    click.echo("Press Ctrl+C to stop both services.")
    t_backend = threading.Thread(target=_prefix_output, args=(backend, "backend"), daemon=True)
    t_frontend = threading.Thread(target=_prefix_output, args=(frontend, "frontend"), daemon=True)
    t_backend.start()
    t_frontend.start()

    try:
        while backend.poll() is None and frontend.poll() is None:
            time.sleep(0.5)
    finally:
        _cleanup(*processes)

    # If we reach here, a child exited unexpectedly (signal handler
    # would have called sys.exit(0) before this point).
    click.echo("ERROR: A service exited unexpectedly", err=True)
    sys.exit(1)


@main.command()
def status():
    """Show current project state."""
    store = FileStore(".")
    try:
        data = store.read_json("current-state.json")
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        click.echo(
            "No project set up yet. Run 'flowbench start' then create a project from the UI."
        )
        return

    if data is None:
        click.echo(
            "No project set up yet. Run 'flowbench start' then create a project from the UI."
        )
        return

    name = data.get("project_display_name", "Unnamed")
    mode = data.get("mode", "new_build")
    mode_label = "Existing App" if mode == "existing_app" else "New Build"
    project_state = data.get("project_state", "unknown")
    phase_state = data.get("current_phase_state")
    phase_state_label = phase_state.replace("_", " ").title() if phase_state else "—"
    total = data.get("total_phases", 0)
    complete = data.get("phases_complete", 0)
    updated = data.get("updated_at", "unknown")

    click.echo(f"Project: {name}")
    click.echo(f"Mode: {mode_label}")
    click.echo(f"State: {project_state.replace('_', ' ').title()}")
    click.echo(f"Phase: {phase_state_label}")
    click.echo(f"Phases: {complete} of {total} complete")
    click.echo(f"Updated: {updated}")


@main.command()
@click.option(
    "--url", default="http://127.0.0.1:8000/health", show_default=True, help="Health endpoint URL."
)
def health(url: str):
    """Check whether the backend API is reachable."""
    try:
        req = Request(url, method="GET")
        with urlopen(req, timeout=3) as resp:
            if resp.status != 200:
                click.echo(
                    f"ERROR: /health returned HTTP {resp.status}", err=True
                )
                sys.exit(1)
            try:
                body = json.loads(resp.read())
            except json.JSONDecodeError as exc:
                click.echo(f"ERROR: /health returned invalid JSON: {exc}", err=True)
                sys.exit(1)
    except (URLError, OSError) as exc:
        click.echo(f"ERROR: Could not reach {url}: {exc}", err=True)
        sys.exit(1)

    status = body.get("status", "unknown")
    version = body.get("version", "unknown")
    click.echo(f"status: {status}")
    click.echo(f"version: {version}")


@main.command()
def help_cmd():
    """Show available commands."""
    click.echo("flowbench start  — Start the FlowBench service")
    click.echo("flowbench status — Show current project state")
    click.echo("flowbench health — Check whether the backend API is reachable")


if __name__ == "__main__":
    main()
