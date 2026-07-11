# Phase 6 — Existing App Mode (Revised)

## Overview

Enable `load_existing_project` end-to-end: consistent project-boundary path, scope_ready-based completion events, schema-validated audit persistence, mode-aware context injection, and a simplified frontend mode selector. All FlowBench artifact-location and write-boundary rules use the selected repository consistently — because the selected repository IS the working directory.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **`repo_path` = CWD always** | The contract says `.flowbench/` lives in the selected repository and the repo IS the project boundary. For both `new_build` and `existing_app`, the working directory IS the selected repo. No separate path input. Entered-path flexibility deferred to Phase 7 (multi-repo). |
| **Template resolution uses Python source path** | `action_service.py` currently resolves templates relative to `self.repo_path`, which fails when `.flowbench/` is in the repo but templates are in the FlowBench install tree. Fix: resolve templates via `Path(__file__).parents[3] / "adapters" / "commands"` — same pattern `_load_config()` already uses. |
| **Audit events on `scope_ready`** | Adding `audit_complete`/`audit_failed` events to `scope_ready` makes `load_existing_project` a two-phase adapter. Success → `scope_ready` (ready for `edit_scope` → `generate_master_plan`). Failure → `project_blocked` (recoverable via `retry`, `revise_scope`, or `cancel_project`). System actions (`edit_scope`, `cancel_project`) and other adapter paths (`generate_master_plan` targeting `master_plan_drafting`) are unaffected. |
| **Retry is executable from `project_blocked`** | The `retry` action already exists in `project_blocked`'s actions. The adapter pipeline resolves `load_existing_project` as the retry target, re-runs the audit, and evaluates the new `scope_ready` events. No new recovery action needed. |
| **Workflow contract updated alongside config** | `docs/workflow-contract.json` is authoritative. The `scope_ready` events in the contract are updated to match `config/workflows.json`. A contract-validation test proves they stay in sync. |

## Files

### Modify (11)

| File | Change |
|------|--------|
| `config/workflows.json` | Add `audit_complete` / `audit_failed` events to `scope_ready` state |
| `docs/workflow-contract.json` | Add `audit_complete` / `audit_failed` events to `scope_ready` in contract |
| `services/orchestrator/api/actions.py` | Add `load_existing_project` bootstrap block (writes bootstrap state to `repo_path/.flowbench/`, reloads into `state_data`) |
| `services/orchestrator/api/state.py` | Add `mode` and `mode_label` to GET `/state` response |
| `services/orchestrator/services/action_service.py` | Fix template path resolution to use Python source path; add `AuditArtifact` schema validation in artifact-write block |
| `services/orchestrator/services/context_service.py` | In `assemble()`: if `state.mode == "existing_app"` and `existing_app_audit` in bundle, prepend audit to scope |
| `adapters/commands/audit-existing-app.md` | Add structured JSON output spec matching `AuditArtifact` schema |
| `apps/web/src/components/command-pane.tsx` | Replace no-project UI with accessible mode selector (New Build / Existing App tabs). Existing App tab shows "Start Audit" button (no path input). |
| `apps/web/src/components/project-header.tsx` | Show "Existing App" badge when `mode === "existing_app"` |
| `services/orchestrator/tests/test_state_machine.py` | Add contract-validation test: verify `scope_ready` events in `workflows.json` match `workflow-contract.json` |
| `apps/web/src/__tests__/command-pane.test.tsx` (new) | Frontend tests for mode selector render, tab switch, submit, disabled state, error handling |

## Sub-tasks

### 6.1 — `workflows.json`: Add audit events to `scope_ready`

**File**: `config/workflows.json`

Change `scope_ready.events` from `{}` to:

```json
"events": {
  "audit_complete": {
    "target_state": "scope_ready"
  },
  "audit_failed": {
    "target_state": "project_blocked"
  }
}
```

**Why `scope_ready`?** The adapter pipeline transitions from `starting` → `scope_ready` (intermediate state), then evaluates events on `scope_ready`. The `audit_complete` event keeps the state at `scope_ready` on success. The `audit_failed` event transitions to `project_blocked` on failure — consistent with all other two-phase adapter patterns (e.g., `master_plan_drafting` → `draft_failed` → `project_blocked`). System actions from `scope_ready` (`edit_scope`, `cancel_project`) are unaffected.

### 6.2 — `workflow-contract.json`: Add audit events

**File**: `docs/workflow-contract.json`

In the `scope_ready` state definition (around line 124-169), change from no events section to:

```json
"scope_ready": {
  "label": "Scope is ready",
  "level": "project",
  "on_entry_artifact": "scope",
  "actions": { ... },
  "events": {
    "audit_complete": {
      "target_state": "scope_ready",
      "description": "Existing-app audit completed successfully. State remains scope_ready — user can edit scope or generate a master plan."
    },
    "audit_failed": {
      "target_state": "project_blocked",
      "description": "Existing-app audit failed. Transition to project_blocked — user can retry, revise scope (back to scope_ready), or cancel."
    }
  }
}
```

And update `load_existing_project`'s `artifact_created` field from `"audit.json (if existing app mode)"` to `"audit.json"` and add `"completion_events": ["audit_complete", "audit_failed"]`.

### 6.3 — Backend: Bootstrap `load_existing_project` in `actions.py`

**File**: `services/orchestrator/api/actions.py`

Add after the existing `start_new_project` bootstrap block (after line 136):

```python
if action == "load_existing_project" and state_data is None:
    repo_path = str(Path.cwd().resolve())
    boot_state = CurrentState(
        project_display_name="My Project",
        repo_path=repo_path,
        mode="existing_app",
        project_state="starting",
        total_phases=0,
        phases_complete=0,
        adapter="opencode",
        updated_at=datetime.now(timezone.utc),
    )
    store.write_json("current-state.json", json.loads(boot_state.model_dump_json()))
    state_data = boot_state.model_dump()
```

**`repo_path` = CWD**: The selected repository IS the working directory. No user-entered path. `Path.cwd().resolve()` produces the canonical absolute path. `.flowbench/` lives at `CWD/.flowbench/`, consistent with the contract.

**Why write to disk?** The adapter pipeline (`dispatch_adapter_action`) reads state from disk at step 3. Without a file on disk, it returns `NO_PROJECT`. This one-time bootstrap write is the two-phase pattern: the adapter pipeline overwrites state after the transition (intermediate state write at step 10).

**No scope written**: `load_existing_project` produces `audit.json`, not scope. The user uses `edit_scope` to set scope content before generating a master plan.

### 6.4 — Backend: Surface `mode` in state API response

**File**: `services/orchestrator/api/state.py`

In `get_state()`, before the return:

```python
data["mode"] = data.get("mode", "new_build")
data["mode_label"] = "Existing App" if data.get("mode") == "existing_app" else "New Build"
```

### 6.5 — Backend: Fix template resolution in `action_service.py`

**File**: `services/orchestrator/services/action_service.py`

**Problem**: Template path uses `Path(self.repo_path) / "adapters" / "commands" / template_name`. When `repo_path` is the selected repository (not the FlowBench install dir), templates are not found.

**Fix**: Add a method that resolves templates from the Python source tree (same pattern `_load_config` uses):

```python
def _get_template_path(self, template_name: str) -> Path:
    return Path(__file__).resolve().parents[3] / "adapters" / "commands" / template_name
```

Replace line 254-256:

```python
template_path = (
    Path(self.repo_path) / "adapters" / "commands" / template_name
)
```

with:

```python
template_path = self._get_template_path(template_name)
```

The `template_version = self._hash_file(template_path) if template_path.exists() else None` at line 257-258 stays unchanged — it works with the new path.

### 6.6 — Backend: Audit schema validation in `action_service.py`

**File**: `services/orchestrator/services/action_service.py`

In `dispatch_adapter_action()`, step 12 (the artifact-writing block at lines 319-340), after `isinstance(output_data, dict)` check, before `store.write_json`:

```python
if artifact_filename == "audit.json":
    from services.orchestrator.schemas.artifacts import AuditArtifact
    try:
        AuditArtifact.model_validate(output_data)
    except Exception:
        raise ValueError("Audit artifact failed schema validation")
```

The enclosing `except (json.JSONDecodeError, ValueError, OSError)` catches the re-raised `ValueError` and marks the adapter as failed, preventing partial artifact writes.

**Required fields** (`AuditArtifact`): `repo_path` (str), `generated_at` (ISO datetime). Optional fields default gracefully.

### 6.7 — Backend: Mode-aware context injection in `assemble()`

**File**: `services/orchestrator/services/context_service.py`

In `assemble()`, after the bundle is built and before returning:

```python
if state.mode == "existing_app" and "existing_app_audit" in bundle:
    audit = bundle["existing_app_audit"]
    if "scope" in bundle:
        bundle["scope"] = (
            f"Current Project State:\n{audit}\n\nScope:\n{bundle['scope']}"
        )
```

### 6.8 — Backend: Update `audit-existing-app.md` template

**File**: `adapters/commands/audit-existing-app.md`

```markdown
You are auditing an existing codebase at $repo_path.

Scan the repository and produce a structured audit report covering:
1. Project structure and framework detection
2. Entry points and module organization
3. Dependencies and package management
4. Test infrastructure and coverage patterns
5. Git history and branching strategy

Write your complete structured output to $output_path as a JSON file
conforming to this schema:

- repo_path (string, required): the canonical path of the audited repo
- framework (string or null): detected framework
- directory_structure (array of strings): key file paths relative to repo root
- entry_points (array of strings): module entry points
- dependencies (array of objects): each with name, version, type fields
- test_frameworks (array of strings): detected test tools
- git_info (object or null): with branch, last_commit, has_uncommitted fields
- generated_at (ISO 8601 string, required): when the audit was produced
```

`$output_path` and `$repo_path` are substituted by the command builder. `generated_at` is filled by the execution tool at runtime.

### 6.9 — Frontend: No-project UI mode selector (no path input)

**File**: `apps/web/src/components/command-pane.tsx`

Add state:

```typescript
const [mode, setMode] = useState<"new_build" | "existing_app">("new_build");
const [loadingExisting, setLoadingExisting] = useState(false);
```

Add handler:

```typescript
const handleLoadExistingApp = async () => {
  setLoadingExisting(true);
  try {
    const res = await postAction("load_existing_project");
    if (res.status === "error") {
      toast(res.message, "destructive");
    } else {
      toast(res.message ?? "Project loaded");
    }
    reloadAll();
  } catch {
    toast("An unexpected error occurred.", "destructive");
  } finally {
    setLoadingExisting(false);
  }
};
```

Replace the no-project return block (lines 93-117):

```tsx
if (isNoProject) {
  return (
    <div className={`flex flex-col p-4 gap-4 ${className}`}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Actions
      </h3>
      <div role="radiogroup" aria-label="Project mode"
           className="flex gap-0 border rounded-lg overflow-hidden">
        <button role="radio" aria-checked={mode === "new_build"}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            mode === "new_build"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
          onClick={() => setMode("new_build")}>
          New Build
        </button>
        <button role="radio" aria-checked={mode === "existing_app"}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            mode === "existing_app"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
          onClick={() => setMode("existing_app")}>
          Existing App
        </button>
      </div>

      {mode === "new_build" ? (
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-sm mb-2">Start new project</h4>
          <label htmlFor="scope-input" className="sr-only">App idea</label>
          <textarea id="scope-input"
            className="w-full h-24 rounded border border-input bg-background p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Describe your app idea..."
            value={scopeText}
            onChange={(e) => setScopeText(e.target.value)}
          />
          <Button className="w-full mt-2" onClick={handleCreateProject}
            disabled={creating || !scopeText.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <h4 className="font-medium text-sm mb-2">Load existing app</h4>
          <p className="text-xs text-muted-foreground mb-3">
            FlowBench will scan the current working directory and
            produce an audit report for planning.
          </p>
          <Button className="w-full" onClick={handleLoadExistingApp}
            disabled={loadingExisting}>
            {loadingExisting ? "Auditing..." : "Start Audit"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

No path input. The existing codebase IS the current working directory. The "Start Audit" button fires `load_existing_project` with no body — the bootstrap defaults to CWD.

### 6.10 — Frontend: Mode badge in project header

**File**: `apps/web/src/components/project-header.tsx`

After the `project_state_label` span:

```tsx
{data?.mode === "existing_app" && (
  <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
    Existing App
  </span>
)}
```

### 6.11 — Tests: Contract validation

**File**: `services/orchestrator/tests/test_state_machine.py`

Add a test that the `scope_ready` events in `workflows.json` match `workflow-contract.json`:

```python
def test_scope_ready_events_match_contract():
    """Verify audit_complete / audit_failed events on scope_ready match the contract."""
    import json
    from pathlib import Path

    repo_root = Path(__file__).resolve().parents[3]

    with open(repo_root / "config" / "workflows.json") as f:
        workflows = json.load(f)
    with open(repo_root / "docs" / "workflow-contract.json") as f:
        contract = json.load(f)

    wf_events = workflows["project_machine"]["states"]["scope_ready"].get("events", {})
    ct_events = contract["states"]["scope_ready"].get("events", {})

    assert set(wf_events.keys()) == set(ct_events.keys()), (
        f"workflows.json events {set(wf_events.keys())} != "
        f"contract events {set(ct_events.keys())}"
    )
    for name in wf_events:
        assert wf_events[name]["target_state"] == ct_events[name]["target_state"], (
            f"Event '{name}' target mismatch: "
            f"workflows={wf_events[name]['target_state']} "
            f"contract={ct_events[name]['target_state']}"
        )
```

### 6.12 — Tests: Backend integration tests for existing_app flow

**File**: `services/orchestrator/tests/test_api.py`

Add `TestExistingApp` class:

```python
class TestExistingApp:
    def test_bootstrap_success_creates_state(self, mock_adapter):
        """Bootstrap writes state with mode=existing_app, canonically resolved repo_path."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({
                "repo_path": str(Path.cwd().resolve()),
                "framework": "python",
                "directory_structure": [],
                "entry_points": [],
                "dependencies": [],
                "test_frameworks": [],
                "generated_at": "2026-01-01T00:00:00Z",
            }),
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["new_state"] == "scope_ready"

        store = FileStore(".")
        persisted = store.read_json("current-state.json")
        assert persisted["mode"] == "existing_app"
        assert persisted["repo_path"] == str(Path.cwd().resolve())

    def test_bootstrap_creates_audit_artifact(self, mock_adapter):
        """Successful audit creates audit.json with schema-valid fields."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({
                "repo_path": str(Path.cwd().resolve()),
                "framework": "python",
                "directory_structure": ["src/", "tests/"],
                "entry_points": ["src/main.py"],
                "dependencies": [{"name": "fastapi", "version": "0.100", "type": "runtime"}],
                "test_frameworks": ["pytest"],
                "git_info": {"branch": "main", "last_commit": "abc123", "has_uncommitted": False},
                "generated_at": "2026-01-01T00:00:00Z",
            }),
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200

        store = FileStore(".")
        audit = store.read_json("audit.json")
        assert audit is not None
        assert audit["framework"] == "python"
        assert audit["repo_path"] == str(Path.cwd().resolve())

    def test_bootstrap_creates_runrecord(self, mock_adapter):
        """Adapter dispatch creates a RunRecord with action=load_existing_project."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text='{"repo_path": ".", "generated_at": "2026-01-01T00:00:00Z"}',
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200

        runs_resp = client.get("/api/v1/runs")
        runs = runs_resp.json().get("runs", [])
        audit_runs = [r for r in runs if r["action"] == "load_existing_project"]
        assert len(audit_runs) == 1
        assert audit_runs[0]["status"] == "succeeded"

    def test_bootstrap_logs_started_event(self, mock_adapter):
        """Event log contains project_loaded_existing and audit_complete."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text='{"repo_path": ".", "generated_at": "2026-01-01T00:00:00Z"}',
        )
        client.post("/api/v1/actions/load_existing_project")

        events_resp = client.get("/api/v1/events")
        events = events_resp.json()["events"]
        event_names = [e["event"] for e in events]
        assert "project_loaded_existing" in event_names
        assert "audit_complete" in event_names

    def test_adapter_failure_yields_project_blocked(self, mock_adapter):
        """Adapter failure → final state is project_blocked, no audit.json."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="Scan failed",
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200
        assert resp.json()["status"] == "failed"
        assert resp.json()["new_state"] == "project_blocked"

        store = FileStore(".")
        assert store.read_json("audit.json") is None

    def test_adapter_failure_logs_failed_event(self, mock_adapter):
        """Adapter failure → event log contains audit_failed."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=False, outcome="failed", output_text="Scan failed",
        )
        client.post("/api/v1/actions/load_existing_project")

        events_resp = client.get("/api/v1/events")
        events = events_resp.json()["events"]
        assert any(e["event"] == "audit_failed" for e in events)

    def test_malformed_output_rejected(self, mock_adapter):
        """Non-JSON output → failure, no artifact, blocked."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded", output_text="not json",
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200
        assert resp.json()["status"] == "failed"
        assert resp.json()["new_state"] == "project_blocked"

        store = FileStore(".")
        assert store.read_json("audit.json") is None

    def test_missing_required_fields_rejected(self, mock_adapter):
        """Valid JSON but missing AuditArtifact required fields → failure."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        # Missing generated_at
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text='{"repo_path": ".", "framework": "react"}',
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200
        assert resp.json()["status"] == "failed"

        store = FileStore(".")
        assert store.read_json("audit.json") is None

    def test_new_build_unchanged(self):
        """start_new_project still produces mode=new_build, no audit artifact."""
        resp = client.get("/api/v1/state")
        assert resp.json().get("mode") == "new_build"
        store = FileStore(".")
        assert store.read_json("audit.json") is None

    def test_mode_in_state_response(self):
        """GET /state returns mode and mode_label."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        client.post("/api/v1/actions/load_existing_project",
                     json={"confirmed": True})
        resp = client.get("/api/v1/state")
        assert resp.json().get("mode") == "existing_app"
        assert resp.json().get("mode_label") == "Existing App"

    def test_canonical_path_in_audit_output(self, mock_adapter):
        """Adapter output repo_path matches the canonical CWD the API resolved."""
        Path(".flowbench/current-state.json").unlink(missing_ok=True)
        mock_adapter.result = AdapterResult(
            success=True, outcome="succeeded",
            output_text=json.dumps({
                "repo_path": str(Path.cwd().resolve()),
                "framework": "python",
                "directory_structure": [],
                "entry_points": [],
                "dependencies": [],
                "test_frameworks": [],
                "generated_at": "2026-01-01T00:00:00Z",
            }),
        )
        resp = client.post("/api/v1/actions/load_existing_project")
        assert resp.status_code == 200

        store = FileStore(".")
        audit = store.read_json("audit.json")
        assert audit["repo_path"] == str(Path.cwd().resolve())
```

### 6.13 — Tests: Context injection verification

**File**: `services/orchestrator/tests/test_adapters.py`

In `TestContextService`:

```python
def test_existing_app_audit_prepended_to_scope(self, temp_repo):
    store = FileStore(temp_repo)
    store.write_json("scope.json", {
        "schema_version": 1, "content": "Build a task manager",
        "updated_at": "2026-01-01T00:00:00Z",
    })
    store.write_json("audit.json", {
        "schema_version": 1, "repo_path": temp_repo, "framework": "react",
        "directory_structure": ["src/"], "entry_points": ["src/index.ts"],
        "dependencies": [], "test_frameworks": [],
        "generated_at": "2026-01-01T00:00:00Z",
    })
    state = CurrentState(
        project_display_name="Test", repo_path=temp_repo,
        mode="existing_app", project_state="scope_ready",
        total_phases=0, phases_complete=0, adapter="opencode",
        updated_at="2026-01-01T00:00:00Z",
    )
    svc = ContextService(temp_repo, store)
    bundle = svc.assemble("generate_master_plan", state)
    assert "existing_app_audit" in bundle
    assert bundle["scope"].startswith("Current Project State:")

def test_new_build_no_audit_injection(self, temp_repo):
    store = FileStore(temp_repo)
    store.write_json("scope.json", {
        "schema_version": 1, "content": "Build a task manager",
        "updated_at": "2026-01-01T00:00:00Z",
    })
    store.write_json("audit.json", {
        "schema_version": 1, "repo_path": temp_repo, "framework": "react",
        "directory_structure": [], "entry_points": [],
        "dependencies": [], "test_frameworks": [],
        "generated_at": "2026-01-01T00:00:00Z",
    })
    state = CurrentState(
        project_display_name="Test", repo_path=temp_repo,
        mode="new_build", project_state="scope_ready",
        total_phases=0, phases_complete=0, adapter="opencode",
        updated_at="2026-01-01T00:00:00Z",
    )
    svc = ContextService(temp_repo, store)
    bundle = svc.assemble("generate_master_plan", state)
    assert "Current Project State" not in bundle.get("scope", "")

def test_existing_app_audit_key_resolved(self, temp_repo):
    store = FileStore(temp_repo)
    store.write_json("audit.json", {
        "schema_version": 1, "repo_path": temp_repo, "framework": "react",
        "directory_structure": [], "entry_points": [],
        "dependencies": [], "test_frameworks": [],
        "generated_at": "2026-01-01T00:00:00Z",
    })
    svc = ContextService(temp_repo, store)
    state = CurrentState(
        project_display_name="Test", repo_path=temp_repo,
        mode="existing_app", project_state="starting",
        total_phases=0, phases_complete=0, adapter="opencode",
        updated_at="2026-01-01T00:00:00Z",
    )
    value = svc._resolve_context_key("existing_app_audit", state)
    assert value is not None
    assert "react" in value
```

### 6.14 — Frontend tests for mode selector

**File**: `apps/web/src/__tests__/command-pane.test.tsx` (new)

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandPane } from "@/components/command-pane";

jest.mock("@/hooks/use-project-state", () => ({
  useProjectState: () => ({
    data: { status: "no_project" },
    isLoading: false,
  }),
}));
jest.mock("@/hooks/use-actions", () => ({
  useActions: () => ({ data: [], isLoading: false }),
}));
jest.mock("@/lib/api", () => ({ postAction: jest.fn() }));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

describe("CommandPane — mode selector", () => {
  const { postAction } = require("@/lib/api");

  beforeEach(() => jest.clearAllMocks());

  it("renders New Build tab as default with scope textarea", () => {
    render(<CommandPane />);
    expect(screen.getByText("New Build")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Describe your app idea...")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("switches to Existing App tab on click", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    expect(screen.getByText("Start Audit")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Describe your app idea...")).not.toBeInTheDocument();
  });

  it("switches back to New Build tab", () => {
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("New Build"));
    expect(screen.getByPlaceholderText("Describe your app idea...")).toBeInTheDocument();
  });

  it("disables Audit button while loading", async () => {
    postAction.mockImplementation(() => new Promise(() => {}));
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(screen.getByText("Auditing...")).toBeDisabled();
    });
  });

  it("calls postAction on submit", async () => {
    postAction.mockResolvedValue({ status: "ok", message: "Loaded" });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(postAction).toHaveBeenCalledWith("load_existing_project", undefined);
    });
  });

  it("shows error toast on failure", async () => {
    const { useToast } = require("@/components/ui/toast");
    const toast = jest.fn();
    useToast.mockReturnValue({ toast });
    postAction.mockResolvedValue({ status: "error", message: "Audit failed" });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("Audit failed", "destructive");
    });
  });

  it("re-enables button after API error", async () => {
    postAction.mockResolvedValue({ status: "error", message: "fail" });
    render(<CommandPane />);
    fireEvent.click(screen.getByText("Existing App"));
    fireEvent.click(screen.getByText("Start Audit"));
    await waitFor(() => {
      expect(screen.getByText("Start Audit")).not.toBeDisabled();
    });
  });
});
```

## Implementation Order

1. `config/workflows.json` — add audit events to `scope_ready`
2. `docs/workflow-contract.json` — update contract to match
3. `services/orchestrator/api/actions.py` — bootstrap block
4. `services/orchestrator/api/state.py` — mode + mode_label
5. `services/orchestrator/services/action_service.py` — template path fix + audit validation
6. `services/orchestrator/services/context_service.py` — context injection
7. `adapters/commands/audit-existing-app.md` — structured output spec
8. `services/orchestrator/tests/test_state_machine.py` — contract validation test
9. `services/orchestrator/tests/test_api.py` — TestExistingApp class
10. `services/orchestrator/tests/test_adapters.py` — context tests
11. `apps/web/src/components/command-pane.tsx` — mode selector
12. `apps/web/src/components/project-header.tsx` — mode badge
13. `apps/web/src/__tests__/command-pane.test.tsx` — frontend tests
14. Verify: `pytest` + `ruff check .` + `cd apps/web && npm test && npm run build`

## Verification

```sh
pytest -xvs tests/test_state_machine.py::TestWorkflowContract  # contract sync
pytest -xvs tests/test_api.py::TestExistingApp                 # 12+ tests
pytest -xvs tests/test_adapters.py::TestContextService         # context tests
pytest                                                          # all pass
ruff check .                                                    # clean
cd apps/web && npm test && npm run build                        # frontend
```

## Acceptance Checks

1. **No-project UI**: Two-tab accessible mode selector. Existing App tab shows "Start Audit" with explanation text (no path input).
2. **Existing App bootstrap**: CWD = selected repo. `mode=existing_app`, canonical path in state. Audit runs on CWD.
3. **Successful audit**: `audit.json` written with schema-valid fields, including canonical repo path. State = `scope_ready`.
4. **Failed audit**: State = `project_blocked`. No `audit.json`. Event log has `audit_failed`. RunRecord has `status=failed`.
5. **Malformed audit**: No partial artifact. State = `project_blocked`.
6. **Retry from blocked**: `retry` re-runs the audit. Success → `scope_ready`. Failure → stays `project_blocked`.
7. **New Build unchanged**: `mode=new_build`, no audit context, existing flow preserved.
8. **Mode in API**: `GET /state` returns `mode` and `mode_label`.
9. **Context injection**: Only in existing_app mode with valid audit. Scope prepended with "Current Project State:".
10. **Header badge**: "Existing App" badge visible in existing_app mode.
11. **Template resolution**: Templates found regardless of CWD (Python source path).
12. **Contract sync**: `scope_ready` events in `workflows.json` match `workflow-contract.json`.

## Deferred Boundaries

| Feature | Reason |
|---------|--------|
| Entered repo path (user specifies which directory to audit) | Requires ActionService plumbing for non-CWD repos. Phase 7 (multi-repo). |
| Retry audit with different path | Needs UI for re-entering path from `project_blocked`. Phase 7. |
| Full existing_app golden path test | Spans audit → scope → plan → phase → build → review → test → handoff. Phase 7 contract tests. |
| `project-modes.json` config integration | Phase 7+ polish. |

## Recovery Routes from Failed Audit (project_blocked)

| Action | Result |
|--------|--------|
| `retry` | Re-runs `load_existing_project` with fresh context (same CWD, fresh audit). On success → `scope_ready`. On failure → stays `project_blocked`. |
| `revise_scope` | Transitions to `scope_ready`. User can `edit_scope` and optionally generate master plan (but audit artifacts won't exist for context injection). |
| `cancel_project` | Ends the project. State = `project_complete`. |
