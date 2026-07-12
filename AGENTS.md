# FlowBench

Local workflow console that orchestrates software builds through a structured state machine loop: scope → master plan → phase queue → per-phase (plan → build → review → test → handoff).

## Repo layout

```
apps/web/             — Next.js 14 frontend (shadcn/ui, Tailwind, React Query)
services/orchestrator/ — Python FastAPI backend (entry point)
config/               — workflow state machine, actions, policies, project modes
docs/                 — product scope, master plan, workflow contract (authoritative spec)
```

## Commands

```sh
# Backend — start API server on 127.0.0.1:8000
flowbench start
# Same via uvicorn:
uvicorn services.orchestrator.main:app

# Frontend — dev server (http://localhost:3000)
cd apps/web && npm run dev

# Run all backend tests
pytest

# Lint backend
ruff check .
```

All runtime state lives in `.flowbench/` directory under the project repo. No writes outside `.flowbench/`.

## Architecture

- **State machines** are declarative, driven by `config/workflows.json` (project machine + phase machine). Same file drives backend validation and frontend action rendering.
- **`actions.json`** declares action metadata (labels, risk categories, action types). Risk categories (modify_files, destructive, etc.) require confirmation before dispatch.
- **Adapter-backed actions** (`action_type: adapter`) are stubbed in Phase 1 — returns `adapter_not_available`. Only `system` and `navigation` actions work.
- **RunRecords** track every adapter-backed action. Interrupted runs (status=running on startup) are auto-set to `interrupted`. Single active run enforced at any time.
- **Event log** is append-only `events.ndjson`. Written after durable artifact write succeeds.
- **Artifact namespace** is flat under `.flowbench/`. Phase-specific artifacts use `<type>-<phase-id>.json` pattern (e.g. `phase-plan-phase_003.json`).
- **Approval model**: stage-level pre-dispatch gate based on action `risk_category` in `actions.json`. Backend is the safety authority — UI is convenience layer.
- **Project modes**: `new_build` (no audit) and `existing_app` (audit + context injection).

## Backend structure

| Module | Purpose |
|---|---|
| `api/` | FastAPI routes: state, actions, events, runs |
| `engine/` | State machine engine + guards |
| `store/` | FileStore (atomic JSON writes), RunStore, EventLog |
| `schemas/` | Pydantic models for state, artifacts, events, runs, approvals |
| `cli.py` | Click CLI (`flowbench start`, `flowbench status`) |
| `main.py` | FastAPI app assembly |

## Key API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/v1/state` | Current project/phase state |
| GET | `/api/v1/actions` | Available actions for current state |
| POST | `/api/v1/actions/{action}` | Execute an action (state transition) |
| GET | `/api/v1/events` | Event log (paginated, filterable by level) |
| GET | `/api/v1/runs` | List run records |
| GET | `/api/v1/phase-queue` | Current phase queue |
| GET | `/api/v1/artifacts/{filename}` | Read artifact by name |

## Testing

```sh
pytest                              # all tests
pytest -xvs                         # verbose, stop on first fail
pytest tests/test_state_machine.py  # single file
pytest -k "test_start_new_project"  # single test
```

Tests use `fastapi.testclient.TestClient` and a temp dir fixture. The engine layer (`engine/`) must have zero I/O imports (enforced by `TestNoIO` test). Tests share a live `.flowbench/` dir in CWD (cleaned in fixtures).

## Conventions

- Ruff: line-length 100, target `py311`, lint `E,F,W,I`
- Pydantic v2 models with `schema_version` field >= 1 on all persisted schemas
- Atomic file writes: temp file → fsync → rename into place
- Guards (`engine/guards.py`) are plain functions returning bool, referenced by name in workflow config
- Workflow contract (`docs/workflow-contract.json`) is the authoritative spec — config files must match it
- No secrets, stack traces, or HTML in responses
- FastAPI bound to 127.0.0.1 only
