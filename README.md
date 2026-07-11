# FlowBench

> An open-source local workflow console that turns an app scope into a sharpened master plan, decomposes that plan into phases, and walks each phase through a repeatable build loop until the project is complete — for both new builds and existing running apps.

**Teach the loop, not the code.**

FlowBench sits **above** AI coding agents. It does not write code itself — it orchestrates the process: state tracking, artifact persistence, approval gates, and session handoffs. The configured execution backend (OpenCode, etc.) does the actual building.

## Quick start

```sh
# Install
pip install -e .

# Start the backend API server
flowbench start
# Or directly: uvicorn services.orchestrator.main:app

# In another terminal, start the frontend
cd apps/web && npm install && npm run dev
```

Open http://localhost:3000 to see the console. The API runs on `127.0.0.1:8000`.

## The workflow loop

```
scope → master plan → phase queue → per-phase loop → done
                                        │
                          ┌──────────────┼──────────────┐
                     plan → sharpen → build → review → test → handoff
```

Every phase runs the same sub-loop. State and artifacts persist across sessions in `.flowbench/`.

## Project status

FlowBench is in early development (Phase 1 / 2). Currently working:
- State machine driven by `config/workflows.json` — both project and phase machines
- API: state queries, action dispatch, event log, run records
- Console UI: three-pane layout (phase queue, artifact panel, command pane)
- Approval gates for risky actions (modify_files, destructive)
- Adapter-backed actions return `adapter_not_available` — stubbed until Phase 3

## Architecture

```
apps/web/               Next.js 14 · shadcn/ui · Tailwind · React Query
services/orchestrator/  Python 3.11+ · FastAPI · Pydantic v2
config/                 Declarative state machines, actions, policies, modes
docs/                   Product scope, master plan, workflow contract
```

All runtime state lives in `.flowbench/` in the selected project repo. No writes outside that directory.

Two state machines (project + phase) are driven by `config/workflows.json`, which also validates API responses and UI rendering. `docs/workflow-contract.json` is the authoritative spec.

## Testing

```sh
pytest                      # all backend tests
pytest -xvs                 # verbose, stop on first fail
ruff check .                # lint
```

## License

MIT
