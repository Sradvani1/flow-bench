# Phase 1 — Foundation: Revised Implementation Plan

> Builds from: ../master-plan.json (phase_001), ../workflow-contract.json, ../master-plan.md v3.0
> Revised per: ../archive/phase1_feedback_to_opencode.md
>
> **Phase 1 scope:** Light orchestration service with local state mutation and no adapter execution.
> Pure state machines, versioned schemas, atomic file store, RunRecord persistence, event log,
> config/contract validation. Phase 1 does not execute adapters, does not build UI, and does not
> implement approval workflows beyond schema groundwork.

---

## Product-Language Map

Internal engineering names are never exposed to the user via API responses, event logs, or error messages. Every API response, event description, and error message must use the user-facing label.

| Internal state | User-facing label | Usage |
|---|---|---|
| `starting` | Getting started | Project header, timeline |
| `scope_ready` | Scope is ready | Project header, timeline |
| `master_plan_drafting` | Creating the master plan | Project header, timeline |
| `master_plan_sharpening` | Refining the plan | Project header, timeline |
| `phase_queue_ready` | Ready to start phases | Project header, timeline |
| `phase_in_progress` | Phase in progress | Project header, timeline |
| `phase_handoff` | Reviewing phase handoff | Project header, timeline |
| `project_blocked` | Project needs attention | Project header, timeline, error recovery |
| `project_complete` | Project complete | Project header, timeline |
| `phase_starting` | Preparing phase | Phase header, timeline |
| `phase_plan` | Creating phase plan | Phase header, timeline |
| `phase_sharpening` | Refining phase plan | Phase header, timeline |
| `phase_ready_to_build` | Ready to build | Phase header, timeline |
| `phase_building` | Building | Phase header, timeline |
| `phase_reviewing` | Reviewing results | Phase header, timeline |
| `phase_testing` | Testing | Phase header, timeline |
| `phase_fixing` | Fixing issues | Phase header, timeline |
| `phase_handoff` | Wrapping up phase | Phase header, timeline |
| `phase_complete` | Phase complete | Phase header, timeline |
| `phase_blocked` | Phase needs attention | Phase header, timeline, error recovery |
| `paused_by_builder` | Paused | Event description only (Phase 1: mapped to phase_blocked internally) |

| Internal action | User-facing label |
|---|---|
| `start_new_project` | Start new project |
| `load_existing_project` | Load existing app |
| `generate_master_plan` | Generate master plan |
| `edit_scope` | Edit scope |
| `cancel_project` | Cancel project |
| `accept_master_plan` | Accept the plan |
| `start_building` | Start building |
| `pause` | Pause |
| `accept_handoff` | Accept handoff |
| `replan_from_here` | Re-plan from here |

| Internal concept | User-facing language |
|---|---|
| `adapter_not_available` | "This step needs an execution tool that is not available in this setup yet." |
| `StateTransitionError` | "This action is not available from the current step." |
| `RunRecord.status=interrupted` | "Work stopped unexpectedly." |
| `Invalid transition` | "You can't do that right now. Try one of the available actions instead." |

---

## Ground Rules for Phase 1

### Source of Truth Hierarchy

1. **`current-state.json`** is the authoritative current snapshot. Recovery always reads from here.
2. **`events.ndjson`** is an append-only audit trail for debugging and history. It is NOT the source of truth for recovery. If they disagree after a crash, `current-state.json` wins.
3. **Run records** track execution history but do not determine current state.
4. **Artifact files** (master-plan.json, etc.) hold phase outputs and are referenced by path from `current-state.json`.

### `updated_at` Rule

`updated_at` in `current-state.json` changes **only** when persisted project state materially changes:
- State transitions (e.g., `starting` → `scope_ready`)
- Artifact content changes (e.g., scope edited, master plan saved)
- Configuration changes (e.g., adapter changed)

`updated_at` does **not** change on:
- Read/GET requests
- Navigation actions (`view_all_phases`, `view_summary`, `view_handoff_notes`)
- `adapter_not_available` responses
- Startup recovery marking (interrupting runs)
- Event log reads

### Navigation Action Semantics

Navigation actions (`view_all_phases`, `view_summary`, `view_handoff_notes`) follow these rules:
- Do NOT create RunRecords
- Do NOT mutate state
- Do NOT write event log entries
- Do NOT update `updated_at`
- Return 200 with the same state and a `message` field only
- They exist so the command pane can distinguish "go look at something" from "do something"

### Project vs. Phase Machine Ownership

- **Project machine** owns: overall lifecycle, queue progression, project completion.
- **Phase machine** owns: work within the active phase only (plan → sharpen → build → review → test → fix → handoff).
- **API layer** may coordinate the two machines (e.g., starting a phase transitions the project machine to `phase_in_progress`), but no machine implicitly mutates the other. Every cross-machine transition is explicit in the API action handler.
- The project machine never directly reads or writes phase state. The API layer mediates.

### Naming and ID Normalization

All identifiers use a single consistent format:

| ID type | Format | Example | Rule |
|---|---|---|---|
| `phase_id` | `phase_NNN` (zero-padded, underscore) | `phase_001`, `phase_012` | Always 3 digits, zero-padded. Underscore separator. |
| `run_id` | ULID string | `01J250ABCDEF...` | Standard 26-char ULID. No hyphens. |
| `decision_id` | `decision_NNN` | `decision_001` | Sequential within project. Zero-padded if generated. |
| `approval_id` | ULID string | `01J250GHIJKL...` | Standard ULID. |
| Artifact filenames | `<type>-<phase_id>.json` | `phase-plan-phase_003.json` | Lowercase, hyphen-separated type, phase_id appended. |
| Event log entry | No filename — NDJSON | — | One compact JSON line per event. |

**Character restriction:** Only lowercase alphanumeric (`a-z`, `0-9`), hyphens (`-`), underscores (`_`), and dots (`.`) in filenames. No spaces. No special characters. Reject any config input that violates this.

### Interrupted Run Recovery Behavior (Phase 1)

On startup:
1. Scan runs with `status=running`
2. Set them to `status=interrupted`, set `finished_at`, set `recovery_message`
3. Do **NOT** emit an event log entry (that would be a side effect of recovery, not a user action)
4. Do **NOT** change `current-state.json` or any artifact
5. Do **NOT** change project or phase state
6. Do **NOT** fabricate resumability — the `recovery_message` is plain-English guidance only
7. The next valid user action is: inspect the current state via `GET /state` and `GET /runs/active`, then choose a manual next step
8. "Retry last action" is a **future concept** — Phase 1 carries `recovery_message` but does not implement auto-retry

### Approval Behavior in Phase 1

- Phase 1 includes `ApprovalRecord` schema and `approvals.json` file store support (schema groundwork only).
- Phase 1 does **not** run any approval workflow. No approval gate is enforced.
- If a risky system action exists in Phase 1 (e.g., `cancel_project`), the API executes it directly without requiring explicit confirmation. The risk explanation is available in `GET /actions` metadata but is not enforced as a gate.
- Full approval enforcement (confirmation dialog, backend `confirmed` flag check, audit events) is **deferred to Phase 3+**.
- This is documented so OpenCode does not build a partial approval UX/API prematurely.

### `archive_project` Clarification

`archive_project` is a **logical state action only** in Phase 1:
- It transitions state within `project_complete` (self-loop, no outgoing transition)
- It does NOT move, rename, or delete any files
- It does NOT create archives or tarballs
- The event log records it as `project_archived`
- Its purpose is to let the builder acknowledge "I'm done with this" as a semantic action before starting a new project
- File archiving is future scope

### `pause` vs. `blocked` Distinction

Internally, `pause` maps to `phase_blocked` in Phase 1 (no separate paused state). But:
- **Event description** must distinguish: `"phase_build_paused"` → "You paused the build" vs. `"build_failed"` → "The build encountered an error"
- **User-facing label** for `phase_blocked` when reached via pause: "Paused — inspect and choose next action"
- **User-facing label** for `phase_blocked` when reached via failure: "Phase needs attention — review the issue below"
- A separate `paused` state is explicitly deferred — do not add it in Phase 1

### Existing-App Mode Boundary (Phase 1)

- Phase 1 stores the `mode` field in `current-state.json` (`"new_build"` or `"existing_app"`)
- Phase 1 includes the `audit.json` artifact schema and file store support
- Phase 1 does **NOT** perform real filesystem inspection for existing-app mode
- "Load existing project" in Phase 1 accepts a repo path and stores it, but the actual repository scan (framework detection, directory structure, dependency analysis) is deferred to Phase 6
- The audit artifact in Phase 1 is an empty/placeholder structure — it exists to prove the schema and path work
- Existing-app mode is functionally equal to new-build mode after initialization in Phase 1

### API Idempotency Expectations

| Action | Idempotent? | Behavior on duplicate |
|---|---|---|
| `edit_scope` | Yes | Overwrites scope artifact with same content. Same state. |
| `start_new_project` | No | Transitions from `starting` to `scope_ready`. Second call from `scope_ready` returns `adapter_not_available` (action only valid from `starting`). |
| `cancel_project` | No | Transitions to `project_complete`. Second call from `project_complete` returns invalid transition error. |
| `accept_master_plan` | No | Transitions to `phase_queue_ready`. Second call from `phase_queue_ready` returns invalid transition. |
| `accept_handoff` | No | Transitions to `phase_queue_ready`. Second call from `phase_queue_ready` returns invalid transition. |
| `view_all_phases` | Yes | Always returns same state. No side effects. |
| Navigation actions | Yes | Always safe. No side effects. |
| Adapter-backed actions | N/A in P1 | Always returns `adapter_not_available`. No state change. |

General rule: state-transition actions are naturally idempotent in the sense that applying them twice from the correct starting state produces the same result, but they can only be applied once per lifecycle because the state changes. The state machine enforces this naturally — invalid transitions return 400.

### Plain-English Error Contract Examples

**Invalid transition:**
```json
{
  "status": "error",
  "message": "You can't 'Accept the plan' right now. The scope is still being set up. Try 'Generate master plan' instead.",
  "suggested_action": "Try one of the available actions listed in the command pane.",
  "error_code": "INVALID_TRANSITION"
}
```

**Missing current-state.json (first run):**
```json
{
  "status": "error",
  "message": "No project is set up yet. Start a new project or load an existing one to begin.",
  "suggested_action": "Use 'Start new project' or 'Load existing app' to get started.",
  "error_code": "NO_PROJECT"
}
```

**Corrupt JSON artifact:**
```json
{
  "status": "error",
  "message": "A project file could not be read because it appears to be damaged. This can happen if the file was modified outside FlowBench.",
  "suggested_action": "Check the file at .flowbench/scope.json for errors. You can also delete it and start fresh.",
  "error_code": "CORRUPT_ARTIFACT"
}
```

**Config validation failure at startup:**
```json
{
  "status": "error",
  "message": "The configuration file config/workflows.json contains errors and could not be loaded.",
  "suggested_action": "Check the server logs for details, then fix or restore the configuration file.",
  "error_code": "CONFIG_ERROR"
}
```

**Attempted path escape:**
```json
{
  "status": "error",
  "message": "The requested file path is outside the allowed .flowbench/ directory.",
  "suggested_action": "All project files must stay inside the .flowbench/ folder in your project directory.",
  "error_code": "PATH_ESCAPE"
}
```

**Missing run ID:**
```json
{
  "status": "error",
  "message": "No run record found with that ID. It may have been deleted or may not exist.",
  "suggested_action": "Check the run ID and try again, or view all runs to find the correct one.",
  "error_code": "RUN_NOT_FOUND"
}
```

---

## Implementation Depth Key

Every file is marked with one of:
- **🟢 Full** — Production-ready implementation with full behavior, error handling, edge cases
- **🟡 Skeleton** — Minimal working implementation (stub, thin wrapper, or deferred detail). Enough to compile/import but not feature-complete.
- **🔵 Config** — Static JSON configuration data
- **🟠 Test** — Test file with explicit test cases

---

## 1.1 — Monorepo Scaffolding 🟡 Skeleton

**Non-goals:** No application logic. No server startup logic beyond `uvicorn.run()`. No CLI command implementation beyond a stub. The Next.js app is scaffolding only — no UI components in Phase 1.

### Files

| File | Depth | Notes |
|---|---|---|
| `pyproject.toml` | 🟢 Full | Dependencies, project metadata, scripts entry point |
| `apps/web/package.json` | 🟡 Skeleton | Minimal deps, `next dev` script only. No UI components |
| `apps/web/tsconfig.json` | 🟡 Skeleton | Standard Next.js config |
| `apps/web/tailwind.config.ts` | 🟡 Skeleton | Standard Tailwind config, content paths empty |
| `apps/web/src/app/layout.tsx` | 🟡 Skeleton | Minimal HTML shell, no UI logic |
| `apps/web/src/app/globals.css` | 🟡 Skeleton | Empty Tailwind directives only |
| `.gitignore` | 🟢 Full | Python, Node, OS, IDE patterns |
| `config/project-modes.json` | 🔵 Config | Static mode definitions |
| `config/workflows.json` | 🔵 Config | Transition graph (see 1.7 for exact shape) |
| `config/actions.json` | 🔵 Config | Action catalog (see 1.7 for exact shape) |
| `config/policies.json` | 🔵 Config | Risk categories (see 1.7 for exact shape) |
| `config/adapters/opencode.json` | 🔵 Config | Per-method timeouts (see 1.7 for exact shape) |

### Success criteria
- `uv run pytest` discovers tests
- `uv run uvicorn services.orchestrator.main:app` starts on `127.0.0.1` (config-driven in CLI, default in app)
- `cd apps/web && pnpm run dev` starts without errors
- `ruff check services/` passes
- Directory tree matches plan

---

## 1.2 — Pydantic Schemas (with Schema Versioning) 🟢 Full

**Non-goals:** No serialization logic beyond Pydantic's built-in. No custom validators that inspect file state. No business logic in schema classes. No database or ORM. Approval schemas exist as data shapes only — no workflow enforcement in Phase 1.

### File: `services/orchestrator/schemas/__init__.py` 🟡 Skeleton

Re-export all schemas.

### File: `services/orchestrator/schemas/state.py` 🟢 Full

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CurrentState(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    project_display_name: str
    repo_path: str  # normalized absolute path
    mode: str = "new_build"  # "new_build" | "existing_app"
    project_state: str  # e.g. "scope_ready", "phase_in_progress"
    current_phase_id: Optional[str] = None  # format: "phase_NNN"
    current_phase_state: Optional[str] = None
    total_phases: int = 0
    phases_complete: int = 0
    adapter: str = "opencode"
    updated_at: datetime  # changes only on material state mutation

class PhaseQueueItem(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    phase_id: str  # format: "phase_NNN"
    name: str
    status: str  # "upcoming" | "in_progress" | "complete" | "blocked" | "skipped"
    skip_reason: Optional[str] = None
```

### File: `services/orchestrator/schemas/artifacts.py` 🟢 Full

(See the original plan — all 10 artifact schemas with `schema_version: int`, typed fields, and the PhaseQueueItem schema. No changes to field definitions from the original plan.)

### File: `services/orchestrator/schemas/events.py` 🟢 Full

```python
class EventLogEntry(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    timestamp: datetime
    level: str  # "project" | "phase"
    event: str  # e.g. "transition", "action", "adapter_not_available"
    from_state: Optional[str] = None
    to_state: Optional[str] = None
    actor: str  # "system" | "builder"
    description: str  # plain English, user-facing language
    phase_id: Optional[str] = None
    artifact_type: Optional[str] = None
```

### File: `services/orchestrator/schemas/approvals.py` 🟡 Skeleton

Schema groundwork only. No workflow enforcement in Phase 1.
```python
class ApprovalRecord(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    approval_id: str  # ULID
    action: str
    action_description: str
    risk_category: Optional[str] = None
    risk_explanation: Optional[str] = None
    status: str  # "pending" | "confirmed" | "dismissed"
    confirmed_at: Optional[datetime] = None
    created_at: datetime
```

### File: `services/orchestrator/schemas/adapter.py` 🟡 Skeleton

```python
class AdapterResult(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    success: bool
    output_text: str
    artifact_path: Optional[str] = None
    suggested_next_action: Optional[str] = None
```

### File: `services/orchestrator/schemas/run_record.py` 🟢 Full

```python
class RunRecord(BaseModel):
    schema_version: int = Field(default=1, ge=1)
    run_id: str  # ULID, 26 chars
    action: str
    phase_id: Optional[str] = None  # format: "phase_NNN"
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str  # queued|running|succeeded|failed|timed_out|cancelled|interrupted
    input_artifact_refs: dict[str, str] = {}
    output_artifact_path: Optional[str] = None
    failure_message: Optional[str] = None  # plain English
    recovery_message: Optional[str] = None  # plain English
    template_version: Optional[str] = None
    working_directory: Optional[str] = None
    command_context_hash: Optional[str] = None  # sha256 hex digest
```

### File: `services/orchestrator/schemas/errors.py` 🟢 Full

```python
class ErrorResponse(BaseModel):
    status: str = "error"
    message: str  # plain English, user-facing
    suggested_action: str  # plain English, user-facing
    error_code: str
```

### Success criteria
- All schemas import without errors
- `CurrentState(schema_version=1, ...)` creates valid instance
- Schema validation rejects malformed data with clear errors
- `RunRecord(status="invalid")` raises validation error
- `PhaseQueueItem(phase_id="invalid")` — phase_id is a free string in Phase 1 (validation enforced in naming convention test)
- Serialize to JSON and deserialize back

---

## 1.3 — Pure Two-Level State Machine Engine 🟢 Full

**Non-goals:** No adapter calls. No persistence. No file I/O. No event log writes. No coordination between project and phase machines — each operates independently. Guards do not access the filesystem or call external services. No `StateTransitionError` message exposes internal state machine terminology — all errors use user-facing state labels.

### Architecture

The state machine is a pure function:
```
(current_state, action, machine, guards, context) → (new_state, events)
```

Zero I/O. No imports from `json`, `os`, `pathlib`, `subprocess`, or any network library in `engine/`.

### Files

| File | Depth | Notes |
|---|---|---|
| `services/orchestrator/engine/__init__.py` | 🟡 Skeleton | Re-export public symbols |
| `services/orchestrator/engine/state_machine.py` | 🟢 Full | Core `StateMachine` class with `transition()`, `handle_event()`, `get_valid_actions()` |
| `services/orchestrator/engine/project_machine.py` | 🟡 Skeleton | Factory function `create_project_machine(transitions)` |
| `services/orchestrator/engine/phase_machine.py` | 🟡 Skeleton | Factory function `create_phase_machine(transitions)` |
| `services/orchestrator/engine/guards.py` | 🟢 Full | All guard functions (`all_phases_complete`, `scope_has_content`, `next_phase_exists`, `has_upcoming_phases`) |

### `StateMachine` class (`state_machine.py`)

```python
class StateTransitionError(Exception):
    """Raised when a transition is invalid. message is plain English, user-facing."""

class StateMachine:
    """Pure state machine. No I/O. No side effects."""

    def __init__(self, transitions: dict): ...
    def get_valid_actions(self, state: str) -> list[dict]: ...
    def transition(self, current_state: str, action: str, guards: dict, context: dict) -> tuple[str, list[dict]]: ...
    def handle_event(self, current_state: str, event: str, succeeded: bool, guards: dict, context: dict) -> tuple[str, list[dict]]: ...
```

`StateTransitionError.message` is a user-facing plain English string using product-language labels. Not internal state names.

### Ownership Rule

Enforced in the API layer (1.6), not in the state machine:
- Project machine API handlers call only project machine methods
- Phase machine API handlers call only phase machine methods
- The API action router determines which machine to use based on the current level
- No single API handler calls both machines in sequence

### Transition Tables

(See the original plan — complete transition tables for both project and phase machines with 35 + 30 transitions. No changes to the transition definitions. Guards: `scope_has_content`, `next_phase_exists`, `has_upcoming_phases`, `all_phases_complete`.)

### Guards

Each guard is a pure function `(context: dict) → bool`. Context is a dict of values passed at call time — never read from the filesystem.

- `scope_has_content`: `context.get("scope", "")` is non-empty after stripping
- `next_phase_exists`: `context.get("phase_queue", [])` has any item with `status == "upcoming"`
- `has_upcoming_phases`: at least 2 items with `status == "upcoming"`
- `all_phases_complete`: all items in `context.get("phase_queue", [])` have `status == "complete"`

### Test cases (complete set from original plan, plus:)

- `test_state_machine_message_is_user_facing`: `StateTransitionError` message uses product-language state labels, not internal names
- `test_no_io_in_engine`: verify `engine/` module has no imports from `json`, `os`, `pathlib`, `subprocess`, `socket`, `requests`, `httpx`
- `test_project_machine_does_not_call_phase`: project machine never references phase state names
- `test_phase_machine_does_not_call_project`: phase machine never references project state names

---

## 1.4 — Atomic File Store 🟢 Full

**Non-goals:** No business logic. No state validation. No state machine calls. No event log writes — event log has its own store. No file caching or in-memory buffer. No ZIP, tar, or archive operations. No writes outside `.flowbench/` directory tree.

### Files

| File | Depth | Notes |
|---|---|---|
| `services/orchestrator/store/__init__.py` | 🟡 Skeleton | Re-exports |
| `services/orchestrator/store/file_store.py` | 🟢 Full | `FileStore` with atomic write, path validation, symlink resolution |
| `services/orchestrator/store/event_log.py` | 🟢 Full | `EventLog` with append, read, pagination |

### `FileStore` (`file_store.py`)

```python
class FileStore:
    """Atomic file-backed persistence. All writes within <repo>/.flowbench/."""

    def __init__(self, repo_path: str): ...
    def _validate_path(self, rel_path: str) -> Path: ...
        # Resolve symlinks. Raise PermissionError if path escapes .flowbench/.
    def write_json(self, rel_path: str, data: dict) -> str: ...
        # tempfile.mkstemp → write → flush → os.fsync → os.rename
    def read_json(self, rel_path: str) -> Optional[dict]: ...
    def delete(self, rel_path: str) -> bool: ...
    def list_dir(self, rel_path: str = "") -> list[str]: ...
    def exists(self, rel_path: str) -> bool: ...
```

### `EventLog` (`event_log.py`)

```python
class EventLog:
    """Append-only NDJSON event log. NOT authoritative source of truth."""

    def __init__(self, repo_path: str): ...
    def append(self, event: dict) -> str: ...
        # json.dumps with separators=(",",":"), append to file, flush
    def read_all(self) -> list[dict]: ...
        # Returns most recent first
    def read_paginated(self, offset: int = 0, limit: int = 50, level: str | None = None) -> tuple[list[dict], int]: ...
    def count(self) -> int: ...
```

### Flat `.flowbench/` Layout

All paths are relative to `<repo>/.flowbench/`:

| Path | Schema | When created |
|---|---|---|
| `current-state.json` | `CurrentState` | On project init |
| `scope.json` | `ScopeArtifact` | On scope save |
| `master-plan.json` | `MasterPlan` | On master plan generation |
| `sharpening-notes.json` | `SharpeningNotes` | On first sharpen action |
| `phase-queue.json` | `list[PhaseQueueItem]` | On master plan accept |
| `audit.json` | `AuditArtifact` | On existing-app audit (skeleton in P1) |
| `approvals.json` | `list[ApprovalRecord]` | On first approval action (Phase 3+) |
| `phase-plan-{phase_id}.json` | `PhasePlan` | On phase plan generation |
| `build-summary-{phase_id}.json` | `BuildSummary` | On build completion |
| `review-findings-{phase_id}.json` | `ReviewFindings` | On review completion |
| `test-results-{phase_id}.json` | `TestResults` | On test completion |
| `handoff-{phase_id}.json` | `Handoff` | On handoff generation |
| `decision-{id}.json` | `DecisionArtifact` | On skip/override/cancel |
| `events.ndjson` | `EventLogEntry` (NDJSON) | Event log, append-only |
| `runs/{run_id}.json` | `RunRecord` | On adapter action dispatch |

### Write Order (for state transitions)

1. Validate via state machine (pure, no I/O)
2. If valid: write artifact via `FileStore.write_json()` (atomic)
3. **Only if step 2 succeeds:** append event via `EventLog.append()`
4. **Only if step 3 succeeds:** update `current-state.json` via `FileStore.write_json()` (atomic)

If step 3 fails, step 2's artifact still exists but no event was recorded — current-state.json is not updated, so the system state is coherent. The artifact is orphaned but recoverable.

If step 4 fails, the artifact and event exist but `current-state.json` still reflects the prior state. On next startup, the system reads `current-state.json` and sees the prior state. The artifact and event are discoverable but the engine state is conservative.

### Test cases (from original plan plus:)

- `test_event_log_not_authoritative`: simulate partial write, verify `current-state.json` is the recovery source
- `test_path_escape_symlink`: create symlink pointing outside `.flowbench/`, verify `PermissionError`
- `test_write_then_crash`: mock a crash after temp file write but before rename, verify no partial file
- `test_flat_layout_no_subdirectories`: all artifact paths are flat (no subdirectory beyond runs/)
- `test_filename_normalization`: filenames match naming convention — lowercase, hyphens, dots only
- `test_phase_id_in_filename`: `phase-plan-phase_003.json` format is consistent

---

## 1.5 — RunRecord Persistence and Recovery 🟢 Full

**Non-goals:** No auto-retry logic. No automatic state mutation on startup. No event log emission during recovery. No support for queuing multiple runs. No RunRecord created by any action endpoint in Phase 1 (run store exists and is tested independently). No "retry last action" API in Phase 1 — the recovery_message carries guidance only.

### `RunStore` (`run_store.py`)

```python
class RunStore:
    """Persistent run record store. Enforces single-active-run."""

    def __init__(self, repo_path: str): ...
    def create_run(self, action: str, phase_id: Optional[str] = None) -> RunRecord: ...
        # Raises RuntimeError if active run exists
    def start_run(self, run_id: str): ...  # queued → running
    def complete_run(self, run_id: str, status: str, ...): ...  # terminal states only
    def interrupt_running_runs(self) -> list[RunRecord]: ...
        # On startup: running → interrupted. No event log. No state mutation.
    def get_active_run(self) -> Optional[RunRecord]: ...  # queued or running
    def get_run(self, run_id: str) -> Optional[RunRecord]: ...
    def get_all_runs(self) -> list[RunRecord]: ...
    def compute_context_hash(self, context_parts: dict[str, str]) -> str: ...
    def update_context(self, run_id: str, context_parts: dict[str, str]): ...
```

### Status Transition Table

```
queued → running          (on dispatch)
running → succeeded       (on successful completion)
running → failed          (on error completion)
running → timed_out       (on timeout)
running → cancelled       (on user cancellation)
running → interrupted     (on startup recovery only — never in normal flow)

Terminal states (succeeded, failed, timed_out, cancelled, interrupted):
  → NO transitions out. Retry creates a new RunRecord with a new run_id.
```

### Recovery Rules (Startup)

1. Scan for runs with `status=running`
2. Set each to `status=interrupted`, set `finished_at`, set `recovery_message`
3. Do **NOT** emit event log entries for this change
4. Do **NOT** mutate `current-state.json`, artifacts, or project/phase state
5. Do **NOT** auto-rerun or fabricate resumability
6. `recovery_message` is plain-English guidance only (e.g., "Work stopped unexpectedly. You can inspect the current state, retry the last action, continue from where you are, or revise the plan.")
7. The interrupted runs are discoverable via `GET /runs/active` and `GET /runs`

### Test cases (from original plan plus:)

- `test_recovery_does_not_emit_event`: call `interrupt_running_runs`, verify 0 new event log entries
- `test_recovery_does_not_mutate_state`: capture current-state.json hash before and after recovery, verify unchanged
- `test_recovery_does_not_change_artifact`: verify artifact files are unmodified after recovery
- `test_recovery_guidance_only`: verify `recovery_message` is set but no auto-retry function is called
- `test_context_hash_deterministic`: same inputs → same hash, different inputs → different hash
- `test_run_id_format`: run_id is valid ULID (26 chars, alphanumeric)

---

## 1.6 — FastAPI Service (Light Orchestration) 🟢 Full

**Non-goals:** No adapter execution. No approval workflow enforcement. No WebSockets. No background workers. No auth. No CORS beyond localhost:3000. No project CRUD (single active project). No Next.js proxying or static file serving. No navigation actions create RunRecords, event log entries, or mutate state.

### Files

| File | Depth | Notes |
|---|---|---|
| `services/orchestrator/main.py` | 🟢 Full | App factory, router registration, error handler registration, health endpoint |
| `services/orchestrator/api/__init__.py` | 🟡 Skeleton | Package init |
| `services/orchestrator/api/state.py` | 🟢 Full | `GET /api/v1/state` |
| `services/orchestrator/api/actions.py` | 🟢 Full | `GET /api/v1/actions`, `POST /api/v1/actions/{action}` |
| `services/orchestrator/api/events.py` | 🟢 Full | `GET /api/v1/events` |
| `services/orchestrator/api/runs.py` | 🟢 Full | `GET /api/v1/runs`, `GET /api/v1/runs/{run_id}`, `GET /api/v1/runs/active` |
| `services/orchestrator/api/error_handlers.py` | 🟢 Full | `StateTransitionError` → 400, general → 500. All responses use `ErrorResponse` schema |
| `services/orchestrator/cli.py` | 🟡 Skeleton | `flowbench start` — calls `uvicorn.run(host="127.0.0.1")`. `status` and `help` are stubs |
| `services/orchestrator/services/__init__.py` | 🟡 Skeleton | Package init |

### API Endpoint Contracts

**Important:** Phase 1 is a "light orchestration service with local state mutation and no adapter execution." It is not "read-oriented" — it does mutate state via system actions. But adapter-backed actions are explicitly unavailable.

#### `GET /api/v1/state`

Returns the current project state. No authentication.

**Response 200:**
```json
{
  "project_display_name": "My App",
  "repo_path": "/Users/me/projects/my-app",
  "mode": "new_build",
  "project_state": "scope_ready",
  "current_phase_id": null,
  "current_phase_state": null,
  "total_phases": 0,
  "phases_complete": 0,
  "adapter": "opencode",
  "updated_at": "2026-07-10T12:00:00Z"
}
```

**Response 200 (no project — first run):**
```json
{
  "status": "no_project",
  "message": "No project is set up yet."
}
```
(Note: this is a deviation from the CurrentState schema — the API should detect missing state and return a non-error but informational response. Alternatively, always initialize a default state on first access. Implementation choice — either is acceptable as long as the API never panics or returns 500 on first run.)

#### `GET /api/v1/actions`

Returns actions valid for the current stage.

**Response 200:**
```json
[
  {
    "action": "generate_master_plan",
    "label": "Generate master plan",
    "description": "Create a full project plan from your scope",
    "risk_category": null,
    "risk_explanation": null,
    "action_type": "adapter",
    "enabled": true
  },
  {
    "action": "edit_scope",
    "label": "Edit scope",
    "description": "Update your app idea description",
    "risk_category": null,
    "risk_explanation": null,
    "action_type": "system",
    "enabled": true
  }
]
```

All adapter-backed actions are visible with `enabled: true` (the builder can see what's available), but POST returns `adapter_not_available`.

#### `POST /api/v1/actions/{action}`

**Request body** (optional — for actions that need input):
```json
{
  "scope_content": "Build a todo app with user accounts..."
}
```

**Behavior by action_type:**

| action_type | Phase 1 behavior |
|---|---|
| `system` | Validate via state machine → execute transition → persist artifact (if any) → update state → log event. Return 200 with new state. |
| `navigation` | Validate action exists for current stage. Return 200 with same state. No event. No state mutation. No RunRecord. |
| `adapter` | Return 200 with `adapter_not_available`. No state change. No RunRecord. No event log entry. |

**Response 200 (system action — success):**
```json
{
  "status": "ok",
  "new_state": "scope_ready",
  "message": "Scope updated"
}
```

**Response 200 (navigation action):**
```json
{
  "status": "ok",
  "message": "All phases shown"
}
```

**Response 200 (adapter-backed action — Phase 1):**
```json
{
  "status": "adapter_not_available",
  "message": "This step needs an execution tool that is not available in this setup yet.",
  "action": "generate_master_plan",
  "state_unchanged": true
}
```

**Response 400 (invalid transition):**
```json
{
  "status": "error",
  "message": "You can't 'Accept the plan' right now. The plan hasn't been generated yet. Try 'Generate master plan' first.",
  "suggested_action": "Try one of the available actions listed in the command pane.",
  "error_code": "INVALID_TRANSITION"
}
```

**Response 400 (state machine error):**
(Use the `StateTransitionError.message` directly with `suggested_action`.)

#### `GET /api/v1/events`

**Query params:** `offset=0&limit=50&level=project`

**Response 200:**
```json
{
  "events": [
    {
      "timestamp": "2026-07-10T12:00:00Z",
      "level": "project",
      "event": "transition",
      "from_state": "starting",
      "to_state": "scope_ready",
      "actor": "builder",
      "description": "Started a new project",
      "phase_id": null,
      "artifact_type": null
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 50
}
```

Event descriptions use user-facing labels.

#### `GET /api/v1/runs`

Returns all RunRecords, most recent first.

#### `GET /api/v1/runs/{run_id}`

Returns single RunRecord or 404.

**Response 404:**
```json
{
  "status": "error",
  "message": "No run record found with that ID. It may have been deleted or may not exist.",
  "suggested_action": "Check the run ID and try again, or view all runs to find the correct one.",
  "error_code": "RUN_NOT_FOUND"
}
```

#### `GET /api/v1/runs/active`

Returns the active run (status=queued or running) or `{"status": "ok", "active": null}`.

#### `GET /health`

```json
{"status": "ok", "version": "0.1.0"}
```

### Error Handlers

`StateTransitionError` → 400 with `ErrorResponse`
All other unhandled exceptions → 500 with generic `ErrorResponse`
No stack traces in any response body.

### CLI (`cli.py`) 🟡 Skeleton

```python
import click

@click.group()
def main(): ...

@main.command()
def start():
    """Start the FlowBench service."""
    import uvicorn
    uvicorn.run("services.orchestrator.main:app", host="127.0.0.1", port=8000)

@main.command()
def status():
    """Show current project state."""
    click.echo("Status: not yet implemented")

@main.command()
def help():
    """Show available commands."""
    click.echo("flowbench start — Start the FlowBench service")
    click.echo("flowbench status — Show current project state")
```

### Test cases (from original plan plus:)

- `test_navigation_action_no_event`: `POST /actions/view_all_phases` → 200, verify 0 new events
- `test_navigation_action_no_state_change`: state hash before and after navigation is identical
- `test_navigation_action_no_runrecord`: verify no new run record file was created
- `test_adapter_action_no_event`: `POST /actions/generate_master_plan` → `adapter_not_available`, verify 0 new events
- `test_adapter_action_no_runrecord`: verify no run record file was created
- `test_updated_at_not_changed_on_read`: capture `updated_at`, call GET /state, verify unchanged
- `test_updated_at_not_changed_on_adapter_unavailable`: capture `updated_at`, POST adapter action, verify unchanged
- `test_updated_at_changed_on_state_transition`: capture `updated_at`, POST system action that transitions, verify changed
- `test_idempotent_edit_scope`: POST same scope content twice, verify no error
- `test_duplicate_start_new_project`: POST from starting → state becomes scope_ready. POST again → adapter_not_available
- `test_error_on_missing_state`: delete current-state.json, GET /state → 200 with `status: "no_project"`
- `test_error_on_corrupt_artifact`: write invalid JSON to scope.json, POST /actions/edit_scope → CORRUPT_ARTIFACT

---

## 1.7 — Config Files 🔵 Config

**Non-goals:** No dynamic config reloading. No environment variable interpolation in JSON files. No config file generation at runtime (files are static). No config validation beyond load-and-parse in Phase 1 (cross-validation lives in 1.8 tests).

### Contract Validation Matrix

Every config file must satisfy these rules. Violations are caught by contract validation tests (1.8):

| Rule | Source | Target | Enforcement |
|---|---|---|---|
| Every action in `actions.json` exists in at least one workflow state | `actions.json` | `workflows.json` | Cross-reference keys |
| Every workflow action has label/description/action_type in `actions.json` | `workflows.json` | `actions.json` | Missing key = test failure |
| Every guard referenced in `workflows.json` exists in `guards.py` | `workflows.json` | `guards.py` | Function name match |
| Every adapter method named in config has timeout in `adapters/opencode.json` | `actions.json` (action_type=adapter) | `adapters/opencode.json` | Method name match |
| Every risk_category referenced in `actions.json` exists in `policies.json` | `actions.json` | `policies.json` | Category name match |
| Every target state in a transition exists as a key in the same machine | `workflows.json` | `workflows.json` | State key existence |
| No duplicate action names with conflicting metadata | `actions.json` | `actions.json` | Unique keys |
| Every action has non-empty label, description, action_type | `actions.json` | — | String length > 0 |
| `phase_id` in artifact filenames matches `phase_NNN` pattern | — | — | Regex `^phase_\d{3}$` |

### Config Files

| File | Depth | Notes |
|---|---|---|
| `config/workflows.json` | 🔵 Config | Full transition graph for project and phase machines (35 + 30 transitions) |
| `config/actions.json` | 🔵 Config | All actions with labels, risk categories, action types |
| `config/policies.json` | 🔵 Config | Risk category definitions with default explanations |
| `config/project-modes.json` | 🔵 Config | Static mode definitions |
| `config/adapters/opencode.json` | 🔵 Config | Per-method timeouts |

Exact JSON shapes for all five files are specified in the original plan's 1.7 section. No structural changes needed.

---

## 1.8 — Workflow Contract Validation Tests 🟠 Test

**Non-goals:** No runtime validation — these are build-time/CI tests. No test that modifies config files. No integration tests that require a running server.

### File: `services/orchestrator/tests/test_workflow_contract.py`

Data-driven tests that read `workflow-contract.json` and validate against `config/` files.

### Drift Detection Tests

In addition to basic validation, include drift-forward tests:

- **Config snapshot fixture** — load all config files at test time and verify cross-references
- **Action reachability test** — every action in `actions.json` must be reachable from at least one state or be flagged as intentionally unreachable (unlikely in V1 but useful as config evolves)
- **State reference completeness** — every state name that appears as a `target_state` or `target_state_on_success`/`target_state_on_failure` must exist as a key in the same machine's transition definitions
- **Risk category cross-ref** — every `risk_category` value in `actions.json` exists as a key in `policies.json`
- **Guard function existence** — every guard name in `workflows.json` maps to an imported callable in `guards.py`
- **Naming convention test** — all phase_id strings in test fixtures and config match `^phase_\d{3}$`

### Test cases

- `test_every_action_in_actions_json_exists_in_workflows`: every key in `actions.json` → appears as action in some workflow state
- `test_every_workflow_action_has_actions_json_entry`: every action referenced in `workflows.json` → exists in `actions.json`
- `test_every_action_has_label`: no empty labels in `actions.json`
- `test_every_target_state_exists`: every target_state value resolves to a key in the same machine
- `test_every_guard_exists`: guard names in workflows → importable functions
- `test_every_risk_category_in_policies`: all risk categories resolve
- `test_every_adapter_action_has_timeout`: adapter actions → timeout in opencode config
- `test_no_duplicate_action_keys`: `actions.json` has unique keys
- `test_phase_id_format`: all phase_id values match `^phase_\d{3}$`
- `test_contract_violation_message`: when a test fails, the error message includes "Contract violation: see workflow-contract.json"

---

## 1.9 — Unit and API Tests 🟠 Test

**Non-goals:** No end-to-end tests that require OpenCode CLI or real adapter execution. No UI tests. No performance or load tests. No tests that modify files outside the test temp directory.

### Test file structure

```
services/orchestrator/tests/
  __init__.py
  conftest.py              # shared fixtures
  test_state_machine.py    # 1.3 — 20+ test cases
  test_file_store.py       # 1.4 — 15+ test cases
  test_schemas.py          # 1.2 — 10+ test cases
  test_run_store.py        # 1.5 — 15+ test cases
  test_api.py              # 1.6 — 25+ test cases
  test_workflow_contract.py  # 1.8 — 12+ test cases (contract validation matrix)
```

### Coverage target

- `engine/`: >95%
- `store/`: >95%
- `schemas/`: >90%
- `api/`: >85%

Run with: `pytest --cov=services/orchestrator --cov-report=term-missing`

---

## Complete File Inventory with Depth

| # | File | Depth | Sub-task |
|---|---|---|---|
| 1 | `pyproject.toml` | 🟢 Full | 1.1 |
| 2 | `apps/web/package.json` | 🟡 Skeleton | 1.1 |
| 3 | `apps/web/tsconfig.json` | 🟡 Skeleton | 1.1 |
| 4 | `apps/web/tailwind.config.ts` | 🟡 Skeleton | 1.1 |
| 5 | `apps/web/src/app/layout.tsx` | 🟡 Skeleton | 1.1 |
| 6 | `apps/web/src/app/globals.css` | 🟡 Skeleton | 1.1 |
| 7 | `.gitignore` | 🟢 Full | 1.1 |
| 8 | `config/project-modes.json` | 🔵 Config | 1.7 |
| 9 | `config/workflows.json` | 🔵 Config | 1.7 |
| 10 | `config/actions.json` | 🔵 Config | 1.7 |
| 11 | `config/policies.json` | 🔵 Config | 1.7 |
| 12 | `config/adapters/opencode.json` | 🔵 Config | 1.7 |
| 13 | `services/orchestrator/schemas/__init__.py` | 🟡 Skeleton | 1.2 |
| 14 | `services/orchestrator/schemas/state.py` | 🟢 Full | 1.2 |
| 15 | `services/orchestrator/schemas/artifacts.py` | 🟢 Full | 1.2 |
| 16 | `services/orchestrator/schemas/events.py` | 🟢 Full | 1.2 |
| 17 | `services/orchestrator/schemas/approvals.py` | 🟡 Skeleton | 1.2 |
| 18 | `services/orchestrator/schemas/adapter.py` | 🟡 Skeleton | 1.2 |
| 19 | `services/orchestrator/schemas/run_record.py` | 🟢 Full | 1.2 |
| 20 | `services/orchestrator/schemas/errors.py` | 🟢 Full | 1.2 |
| 21 | `services/orchestrator/engine/__init__.py` | 🟡 Skeleton | 1.3 |
| 22 | `services/orchestrator/engine/state_machine.py` | 🟢 Full | 1.3 |
| 23 | `services/orchestrator/engine/project_machine.py` | 🟡 Skeleton | 1.3 |
| 24 | `services/orchestrator/engine/phase_machine.py` | 🟡 Skeleton | 1.3 |
| 25 | `services/orchestrator/engine/guards.py` | 🟢 Full | 1.3 |
| 26 | `services/orchestrator/store/__init__.py` | 🟡 Skeleton | 1.4 |
| 27 | `services/orchestrator/store/file_store.py` | 🟢 Full | 1.4 |
| 28 | `services/orchestrator/store/event_log.py` | 🟢 Full | 1.4 |
| 29 | `services/orchestrator/store/run_store.py` | 🟢 Full | 1.5 |
| 30 | `services/orchestrator/main.py` | 🟢 Full | 1.6 |
| 31 | `services/orchestrator/api/__init__.py` | 🟡 Skeleton | 1.6 |
| 32 | `services/orchestrator/api/state.py` | 🟢 Full | 1.6 |
| 33 | `services/orchestrator/api/actions.py` | 🟢 Full | 1.6 |
| 34 | `services/orchestrator/api/events.py` | 🟢 Full | 1.6 |
| 35 | `services/orchestrator/api/runs.py` | 🟢 Full | 1.6 |
| 36 | `services/orchestrator/api/error_handlers.py` | 🟢 Full | 1.6 |
| 37 | `services/orchestrator/cli.py` | 🟡 Skeleton | 1.6 |
| 38 | `services/orchestrator/services/__init__.py` | 🟡 Skeleton | 1.6 |
| 39 | `services/orchestrator/__init__.py` | 🟡 Skeleton | structure |
| 40 | `services/orchestrator/policies/__init__.py` | 🟡 Skeleton | structure |
| 41 | `services/orchestrator/tests/conftest.py` | 🟠 Test | 1.9 |
| 42 | `services/orchestrator/tests/test_state_machine.py` | 🟠 Test | 1.3 |
| 43 | `services/orchestrator/tests/test_file_store.py` | 🟠 Test | 1.4 |
| 44 | `services/orchestrator/tests/test_schemas.py` | 🟠 Test | 1.2 |
| 45 | `services/orchestrator/tests/test_run_store.py` | 🟠 Test | 1.5 |
| 46 | `services/orchestrator/tests/test_api.py` | 🟠 Test | 1.6 |
| 47 | `services/orchestrator/tests/test_workflow_contract.py` | 🟠 Test | 1.8 |

**Depth summary:** 22 Full + 13 Skeleton + 5 Config + 7 Test = 47 files.

---

## Definition of Done (Phase 1)

Phase 1 is complete when:

1. **Workflow contract validation** — every config file cross-validates against the contract validation matrix (1.8 tests pass)
2. **State machines reject invalid transitions** — deterministically, with plain English error messages using user-facing labels
3. **State, artifacts, run records, and events survive a simulated restart** — current-state.json is authoritative; events are audit-only
4. **Startup interrupts orphaned runs** — without mutating state, emitting events, or auto-rerunning
5. **Single-active-run lock enforced** — concurrent adapter action requests are rejected
6. **Adapter-backed actions return `adapter_not_available`** — no state change, no RunRecord, no event
7. **System and navigation actions execute correctly** — navigation does not create events or mutate state
8. **Coverage targets met** — engine/ >95%, store/ >95%, schemas/ >90%, api/ >85%
9. **Contract drift tests pass** — any change to config files that violates the validation matrix is caught as a test failure
10. **Error responses use plain English** — every error path returns a user-facing message, suggested action, and error code. No stack traces.
