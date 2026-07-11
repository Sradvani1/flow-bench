# Phase 5 — Approval Policy, Audit Events & Dialog Dismissal

## Overview

Close the loop on approval policy consistency: shared cached policy module,
backend-visible audit events for both sides of the confirmation gate,
policy-resolved explanations in every API output consumed by the UI,
and explicit local-only dialog dismissal with focus restoration.

## Decision Table

| Trigger | Backend event | `approvals.json` write | API call | UI behaviour |
|---|---|---|---|---|
| Unconfirmed risky action | `confirmation_required` | No | POST (responds `needs_approval`) | Dialog opens with risk explanation |
| Confirmed risky action | `action_approved` + ordinary transition event(s) | Yes (before dispatch) | POST (responds `ok`) | Dialog closes, toast success |
| Non-risky action (`confirmed: true` ignored) | Ordinary transition event(s) only | No | POST (responds `ok`) | Normal flow, no dialog |
| Non-risky action (`confirmed: false` ignored) | Ordinary transition event(s) only | No | POST (responds `ok`) | Normal flow, no dialog |
| Cancel (click or Escape) | — none — | No | **No request** | Dialog closes, focus restored, neutral toast |
| Invalid-stage action | `INVALID_TRANSITION` error | No | POST (responds 400) | Error toast |
| Unknown action | `UNKNOWN_ACTION` error | No | POST (responds 400) | Error toast |

## Files

### Modify (6)

| File | Change |
|------|--------|
| `services/orchestrator/policies.py` (new) | Module-level `@cache`-decorated `load_policies()`, plus `requires_confirmation()`, `get_risk_explanation()`, `get_category()` |
| `services/orchestrator/api/actions.py` | Replace inline `policies.json` read with `load_policies()`; resolve `risk_explanation` through policy engine in `get_actions` and `needs_approval` response; log `confirmation_required` / `action_approved` events; write `ApprovalRecord` on confirmed gate pass; skip approval events/artifact on non-risky actions |
| `services/orchestrator/services/action_service.py` | Replace `_requires_confirmation()` with shared `requires_confirmation()`; keep silent defense-in-depth gate |
| `apps/web/src/components/risk-confirmation-dialog.tsx` | Add Enter-key shortcut; add `aria-describedby`; implement local-only dismiss handler with focus restoration + neutral toast; remove `needs_approval` error branch |
| `apps/web/src/components/command-pane.tsx` | Reorder action handler (risk before adapter); fix filters so risky adapter actions render in "Risky actions" section |
| `apps/web/package.json` | Add `jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jest-environment-jsdom` |

### Create (3)

| File | Purpose |
|------|---------|
| `apps/web/jest.config.ts` | Next.js Jest config |
| `apps/web/src/__tests__/setup.ts` | Import `@testing-library/jest-dom` |
| `apps/web/src/__tests__/risk-confirmation-dialog.test.tsx` | Dialog unit tests (8 tests) |

## Sub-tasks

### 5.1 — `policies.py` (shared cached policy module)

```python
from functools import cache
from pathlib import Path
import json


@cache
def load_policies() -> dict:
    path = Path(__file__).resolve().parent.parent.parent / "config" / "policies.json"
    with open(path) as f:
        return json.load(f)


def requires_confirmation(risk_category: str) -> bool:
    policies = load_policies()
    cat = policies.get("risk_categories", {}).get(risk_category, {})
    return cat.get("requires_confirmation", False)


def get_risk_explanation(risk_category: str, action_entry: dict | None = None) -> str:
    """Action-specific explanation → category default → fallback."""
    if action_entry and action_entry.get("risk_explanation"):
        return action_entry["risk_explanation"]
    policies = load_policies()
    cat = policies.get("risk_categories", {}).get(risk_category, {})
    return cat.get("default_explanation", "Proceed with caution.")


def get_category(risk_category: str) -> dict | None:
    policies = load_policies()
    return policies.get("risk_categories", {}).get(risk_category)
```

**Edge case**: Unknown `risk_category` → `requires_confirmation` returns `False`, `get_risk_explanation` returns `"Proceed with caution."`, `get_category` returns `None`.

No I/O after first call. Both `actions.py` and `action_service.py` replace inline file reads with these functions.

### 5.2 — Policy-resolved `risk_explanation` in `get_actions`

`get_actions` (lines 78-86) currently returns `risk_explanation` directly from `actions.json`. Change to resolve through the policy engine so that actions without an explicit `risk_explanation` still get the category's `default_explanation`:

```python
available.append({
    "action": action_name,
    "label": label,
    "description": entry.get("description", ""),
    "risk_category": entry.get("risk_category"),
    "risk_explanation": (
        get_risk_explanation(entry["risk_category"], entry)
        if entry.get("risk_category")
        else None
    ),
    "action_type": entry.get("action_type", action_info["action_type"]),
    "enabled": True,
})
```

This ensures the `needs_approval` response and the `GET /actions` listing return the same resolved explanation string.

### 5.3 — Wire into `actions.py` — confirmation gate

Replace lines 117-131 (inline policy load + gate) with:

```python
risk_category = action_entry.get("risk_category")

# Resolve explanation through policy engine for the response
resolved_explanation = (
    get_risk_explanation(risk_category, action_entry)
    if risk_category
    else None
)

if risk_category and requires_confirmation(risk_category) and not (body and body.confirmed):
    event_log.append({
        "schema_version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "warning",
        "event": "confirmation_required",
        "from_state": current_project_state or current_phase_state,
        "to_state": None,
        "actor": "builder",
        "description": f"Confirmation required: {label} ({risk_category})",
        "phase_id": current_state_obj.current_phase_id if current_state_obj else None,
        "artifact_type": None,
    })
    return {
        "status": "needs_approval",
        "message": f"This action requires confirmation ({risk_category}).",
        "risk_category": risk_category,
        "risk_explanation": resolved_explanation,
        "action": action,
        "state_unchanged": True,
    }
```

### 5.4 — Wire into `actions.py` — confirmed branch (approvals + `action_approved`)

After the gate passes and `confirmed: true`, write `approvals.json` **and emit `action_approved`** before dispatch. This block fires only for risky actions with `confirmed: true` and runs before the adapter/navigation/system branches:

```python
confirmed_risky = (
    risk_category
    and requires_confirmation(risk_category)
    and body is not None
    and body.confirmed
)

if confirmed_risky:
    # persist approval record (before dispatch)
    approvals_data = store.read_json("approvals.json") or {"approvals": []}
    from services.orchestrator.schemas.approvals import ApprovalRecord
    approvals_data["approvals"].append(ApprovalRecord(
        approval_id=str(uuid.uuid4())[:8],
        action=action,
        action_description=label,
        risk_category=risk_category,
        risk_explanation=resolved_explanation,
        status="confirmed",
        confirmed_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    ).model_dump())
    store.write_json("approvals.json", approvals_data)

    # emit action_approved event (before dispatch, state not yet changed)
    event_log.append({
        "schema_version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": "info",
        "event": "action_approved",
        "from_state": current_project_state or current_phase_state,
        "to_state": None,  # state unknown until transition
        "actor": "builder",
        "description": f"Approved: {label} ({risk_category})",
        "phase_id": current_state_obj.current_phase_id if current_state_obj else None,
        "artifact_type": None,
    })
```

**Why `to_state: None` for `action_approved`?** At this point the transition hasn't happened yet (adapter dispatch might fail). The ordinary transition event(s) that follow will carry the actual `to_state`. For system actions, the ordinary event logged at line 255-268 carries the real `from_state`/`to_state`. The `action_approved` event is purely an audit signal that the user confirmed; it is not a workflow-transition event.

**Non-risky actions**: The `confirmed_risky` block is never entered. No approval record or `action_approved` event is created, even if `body.confirmed` is explicitly `true`. The confirmed flag is silently ignored for non-risky actions — the backend is the authority.

### 5.5 — Wire into `action_service.py`

Replace `_requires_confirmation` method (lines 405-412) with the shared import:

```python
from services.orchestrator.policies import requires_confirmation
```

The defense-in-depth gate at lines 86-96 stays: silent return of `needs_approval` if `confirmed` is missing. No event logging from this gate — it is a code-level safety net, not a user-facing audit point. Events are the responsibility of `actions.py`.

### 5.6 — Approval Model & Format

`ApprovalRecord` already exists at `services/orchestrator/schemas/approvals.py`. The `approvals.json` file format:

```json
{
  "approvals": [
    {
      "schema_version": 1,
      "approval_id": "a1b2c3d4",
      "action": "cancel_project",
      "action_description": "Cancel project",
      "risk_category": "destructive",
      "risk_explanation": "This will mark the project as cancelled...",
      "status": "confirmed",
      "confirmed_at": "2024-01-01T00:00:00+00:00",
      "created_at": "2024-01-01T00:00:00+00:00"
    }
  ]
}
```

Written **at confirmation time before dispatch**, recording intent. `FileStore.write_json` is atomic overwrite; the read-append-write pattern is correct.

### 5.7 — UI Dialog: Local-Only Dismissal (`risk-confirmation-dialog.tsx`)

**Design principle**: Cancel and Escape are purely local UI actions. They send no API request, write no audit event, and produce no workflow-visible signal. The backend is the sole approval authority; the UI only presents information and submits the confirmation.

Implementation:

1. **Enter-key shortcut**: `onKeyDown` on `DialogContent`. When Enter pressed and not loading, call `handleProceed`. Escape is already handled by Radix Dialog's built-in dismissal — no extra handler needed.

2. **`aria-describedby`**: Add `id="risk-description"` to `DialogDescription`, add `aria-describedby="risk-description"` on `DialogContent`.

3. **Local dismiss handler** — shared by Cancel button and Escape (Escape handled by Radix's `onOpenChange(false)`):

```typescript
const handleDismiss = () => {
  onOpenChange(false);
  toast("Action cancelled.", "neutral");
  // Focus restoration handled by Radix Dialog's built-in focus management
  // on the trigger element (the button that opened the dialog).
};
```

4. **Remove `needs_approval` branch**: The dialog always sends `confirmed: true`. Backend never returns `needs_approval` for `confirmed: true`. If it does (bug), fall through to existing error path (toast + dialog close).

5. **Cancel button** calls `handleDismiss` instead of `onOpenChange(false)` directly.

6. **Neutral toast**: The `toast` utility already supports severity levels. Add `"neutral"` or use a non-destructive variant. The message is `"Action cancelled."` — informative, no alarm.

7. **Focus restoration**: Radix Dialog automatically returns focus to the trigger element on close. No additional code needed; verify in testing.

### 5.8 — Command Pane (`command-pane.tsx`)

**Action handler reorder** (lines 37-66) — risk check before adapter check:

```typescript
const handleAction = async (entry: ActionEntry) => {
  if (entry.action_type === "navigation") { ... return; }
  if (entry.risk_category) { setRiskAction(entry); setRiskOpen(true); return; }
  if (entry.action_type === "adapter") { ... return; }
  // system action (non-risky)
  const res = await postAction(entry.action); ...
};
```

**Filter fix** (lines 119-130) — risky adapter actions grouped visually under "Risky actions":

```typescript
const systemActions = actions.filter(a => a.action_type === "system" && !a.risk_category);
const riskyActions = actions.filter(a => a.risk_category);                              // ALL risky
const navigationActions = actions.filter(a => a.action_type === "navigation");
const adapterActions = actions.filter(a => a.action_type === "adapter" && !a.risk_category);  // non-risky only
```

### 5.9 — Backend Tests

Add **5 new test methods** to the existing `TestSystemConfirmation` class in `services/orchestrator/tests/test_api.py`:

| Test | Setup | Asserts |
|------|-------|---------|
| `test_risky_adapter_requires_confirmation` | Phase state `phase_ready_to_build` → POST `start_building` without confirmed | `status=needs_approval`, `risk_category=modify_files`, state unchanged |
| `test_confirmation_required_event_logged` | `scope_ready` → POST `cancel_project` without confirmed | Event log has `confirmation_required` event |
| `test_action_approved_event_logged` | `scope_ready` → POST `cancel_project` with `confirmed:true` | Event log has `action_approved` event |
| `test_approvals_artifact_written` | `scope_ready` → POST `cancel_project` with `confirmed:true` | `approvals.json` exists with valid `ApprovalRecord` |
| `test_non_risky_confirmed_creates_no_approval_audit` | `scope_ready` → POST `edit_scope` with `confirmed:true` (non-risky action) | No `approvals.json`, event log has no `action_approved` or `confirmation_required` |
| `test_invalid_stage_creates_no_approval_audit` | `scope_ready` → POST `generate_phase_plan` (invalid stage) | 400 error, no `approvals.json`, event log unchanged |

Add helper for the first test:

```python
def _setup_phase_ready_to_build():
    store = FileStore(".")
    store.write_json("master-plan.json", {
        "schema_version": 1,
        "phases": [{"id": "phase_001", "name": "Setup"}],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("scope.json", {
        "schema_version": 1,
        "content": "Build an app",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("phase-plan-phase_001.json", {
        "schema_version": 1,
        "plan": "Implement feature",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_json("current-state.json", {
        "schema_version": 1,
        "project_display_name": "Test",
        "repo_path": str(Path.cwd()),
        "mode": "new_build",
        "project_state": "phase_in_progress",
        "current_phase_id": "phase_001",
        "current_phase_state": "phase_ready_to_build",
        "total_phases": 1,
        "phases_complete": 0,
        "adapter": "opencode",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    })
```

Test implementations:

```python
def test_risky_adapter_requires_confirmation(self, mock_adapter):
    _setup_phase_ready_to_build()
    resp = client.post("/api/v1/actions/start_building")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "needs_approval"
    assert data["risk_category"] == "modify_files"
    assert data["state_unchanged"] is True
    state_resp = client.get("/api/v1/state")
    assert state_resp.json()["current_phase_state"] == "phase_ready_to_build"

def test_confirmation_required_event_logged(self):
    _setup_scope_ready()
    client.post("/api/v1/actions/cancel_project")
    events = client.get("/api/v1/events").json()["events"]
    assert any(e["event"] == "confirmation_required" for e in events)

def test_action_approved_event_logged(self):
    _setup_scope_ready()
    client.post("/api/v1/actions/cancel_project", json={"confirmed": True})
    events = client.get("/api/v1/events").json()["events"]
    assert any(e["event"] == "action_approved" for e in events)

def test_approvals_artifact_written(self):
    _setup_scope_ready()
    client.post("/api/v1/actions/cancel_project", json={"confirmed": True})
    store = FileStore(".")
    approvals = store.read_json("approvals.json")
    assert approvals is not None
    assert len(approvals["approvals"]) == 1
    record = approvals["approvals"][0]
    assert record["action"] == "cancel_project"
    assert record["risk_category"] == "destructive"
    assert record["status"] == "confirmed"

def test_non_risky_confirmed_creates_no_approval_audit(self):
    _setup_scope_ready()
    events_before = len(client.get("/api/v1/events").json()["events"])
    store = FileStore(".")
    assert store.read_json("approvals.json") is None
    client.post("/api/v1/actions/edit_scope", json={"confirmed": True})
    assert store.read_json("approvals.json") is None
    events_after = len(client.get("/api/v1/events").json()["events"])
    events = client.get("/api/v1/events").json()["events"]
    assert not any(e["event"] in ("action_approved", "confirmation_required") for e in events)

def test_invalid_stage_creates_no_approval_audit(self):
    _setup_scope_ready()
    events_before = len(client.get("/api/v1/events").json()["events"])
    store = FileStore(".")
    assert store.read_json("approvals.json") is None
    resp = client.post("/api/v1/actions/generate_phase_plan", json={"confirmed": True})
    assert resp.status_code == 400
    assert store.read_json("approvals.json") is None
    events_after = len(client.get("/api/v1/events").json()["events"])
    assert events_after == events_before
```

### 5.10 — Frontend Test Infrastructure

**`jest.config.ts`**:
```typescript
const nextJest = require("next/jest");
const createJestConfig = nextJest({ dir: "./" });
const customJestConfig = {
  setupFilesAfterSetup: ["<rootDir>/src/__tests__/setup.ts"],
  testEnvironment: "jsdom",
};
module.exports = createJestConfig(customJestConfig);
```

**`src/__tests__/setup.ts`**:
```typescript
import "@testing-library/jest-dom";
```

**`package.json` additions**:
```json
"scripts": {
  "test": "jest",
  "test:watch": "jest --watch"
},
"devDependencies": {
  "jest": "^29.7.0",
  "@testing-library/react": "^14.0.0",
  "@testing-library/jest-dom": "^6.0.0",
  "@testing-library/user-event": "^14.0.0",
  "jest-environment-jsdom": "^29.0.0"
}
```

### 5.11 — Frontend Dialog Tests

**`src/__tests__/risk-confirmation-dialog.test.tsx`** — 9 tests:

| Test | Approach | Asserts |
|------|----------|---------|
| `renders with action label and risk explanation` | Render with `risk_explanation` | Title = label, body contains explanation |
| `renders with fallback explanation` | Render with `risk_explanation: null` | Body shows "Are you sure?" |
| `cancel closes dialog without API call` | Click Cancel | `onOpenChange(false)` called, `postAction` NOT called |
| `escape key dismisses without API call` | Press Escape | `onOpenChange(false)` called, `postAction` NOT called |
| `proceed dispatches with confirmed` | Click Proceed | `postAction` called with `confirmed: true` |
| `shows loading state during dispatch` | Slow promise | Button shows "Processing...", disabled |
| `shows error on failure and closes dialog` | `postAction` returns `{status:"error"}` | Error not rendered (toast only), dialog closed |
| `enter key proceeds` | Press Enter | `postAction` called |
| `does not render when action is null` | `action={null}` | Returns null |

## Timeline Cross-Check

Dismissal events (Cancel/Escape) do **not** appear in the event log. The Phase 4 timeline renders only events from `events.ndjson`. This is by design: dismissals are purely local UI actions with no backend-visible signal. Tests must confirm that `events.ndjson` contains no dismissal-related entries after a dialog dismiss.

## Implementation Order

1. Create `services/orchestrator/policies.py`
2. Wire into `actions.py` (replace inline load, policy-resolved `risk_explanation` in `get_actions`, approval events, `approvals.json` write)
3. Wire into `action_service.py` (replace `_requires_confirmation` with shared import)
4. Add 6 tests to `test_api.py`
5. Create `apps/web/jest.config.ts`, `src/__tests__/setup.ts`, update `package.json`
6. Update `risk-confirmation-dialog.tsx` (Enter shortcut, aria-describedby, local dismiss handler, remove needs_approval)
7. Update `command-pane.tsx` (reorder, filter fix)
8. Create dialog tests
9. Verify: `pytest` + `ruff check .` + `cd apps/web && npm test && npm run build`

## Verification

```sh
pytest -xvs tests/test_api.py::TestSystemConfirmation  # 4 old + 6 new = 10 tests
pytest                                                  # all backend tests pass
ruff check .                                            # no lint errors
cd apps/web && npm test                                 # 9 dialog tests pass
cd apps/web && npm run build                            # no type errors
```
