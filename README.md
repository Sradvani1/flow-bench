# FlowBench

> An open-source local workflow console that turns an app scope into a sharpened master plan, decomposes that plan into phases, and walks each phase through a repeatable build loop until the project is complete — for both new builds and existing running apps.

**Teach the loop, not the code.**

FlowBench sits **above** AI coding agents. It does not write code itself — it orchestrates the process: state tracking, artifact persistence, approval gates, and session handoffs. The configured execution backend (OpenCode, etc.) does the actual building.

## Before you start

FlowBench orchestrates an AI coding backend. It needs **OpenCode** installed and configured with a default model.

1. **Install OpenCode** (one line):
   ```sh
   curl -LsSf https://opencode.ai/install.sh | sh
   ```
   Or via Homebrew: `brew install opencode-ai/tap/opencode`  
   Or Go: `go install github.com/opencode-ai/opencode@latest`

   See <https://opencode.ai> for all install options.

2. **Configure a default model** in `~/.config/opencode/opencode.json`:
   ```json
   {
     "models": {
       "default": { "provider": "<provider>", "model": "<model-id>" }
     }
   }
   ```
   *This is illustrative — see OpenCode's docs for the exact config schema.*  
   **FlowBench does not pick the model — OpenCode does. Set it once here.**

## Quick start

```sh
# Install
pip install -e .

# Start both backend API + frontend dev server
flowbench start

# Show current project status
flowbench status
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

FlowBench is in Phase 7 — feature complete. Currently working:
- State machine driven by `config/workflows.json` — both project and phase machines
- API: state queries, action dispatch, event log, run records
- Console UI: three-pane layout (phase queue, artifact panel, command pane)
- Approval gates for risky actions (modify_files, destructive)
- Adapter-backed actions dispatch to OpenCode CLI for execution
- Recovery UI for interrupted runs (inspect, retry, continue, revise the plan)
- Blocked state card with recovery actions and "What happened" section
- Settings screen with project info and backend health
- `flowbench start` — managed dual-service startup with readiness polling
- `flowbench status` — real-time project state overview

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
bash scripts/prereq-check.sh  # verify dev environment
bash scripts/smoke-test.sh    # end-to-end smoke test
```

## License

MIT
