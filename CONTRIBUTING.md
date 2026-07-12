# Contributing to FlowBench

## Dev setup

```sh
# Install Python deps
uv sync

# Install frontend deps
cd apps/web && pnpm install
```

## Running tests

```sh
# Backend tests
pytest

# Frontend tests
cd apps/web && pnpm test

# Lint
ruff check .
```

## Code conventions

- Ruff: line-length 100, target `py311`, lint `E,F,W,I`
- Pydantic v2 models with `schema_version >= 1` on all persisted schemas
- No I/O in `engine/` layer (enforced by `TestNoIO` test)
- Atomic file writes: temp file → fsync → rename into place
- Guards are plain functions returning bool, referenced by name in `workflows.json`

## PR workflow

- Branch naming: `feature/<name>` or `fix/<name>`
- Commit messages: concise, prefixed by area (`cli:`, `api:`, `ui:`, `test:`, `docs:`)
- Ensure all tests pass and `ruff check .` is clean before opening a PR

## Adapter guide

To add a new command template for an adapter-backed action:

1. Add the template file to `adapters/commands/`
2. Register the action in `config/adapters/opencode.json` under `methods`
3. Add context bundle rules in `config/workflow-contract.json` if needed
4. Add the artifact mapping in `action_service.py:_map_adapter_action_to_artifact()`
