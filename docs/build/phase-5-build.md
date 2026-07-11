# Phase 5 — Approval Policy, Audit Events & Dialog Dismissal

**Plan**: `../plan/phase-5-plan.md`

**Status**: Implemented. Shared cached policy module, backend-visible approval audit events (`confirmation_required` / `action_approved`), policy-resolved explanations in API outputs, local-only dialog dismissal with focus restoration, and full test coverage.

## Architecture

```
policies.py (new, @cached)
  ├── requires_confirmation(risk_category) → bool
  ├── get_risk_explanation(risk_category, action_entry?) → str
  └── get_category(risk_category) → dict | None
         ↑                    ↑
    actions.py      action_service.py
    (sys+adapter    (defense-in-depth
     gate + events)  silent gate)

actions.py (modified)
  ┌── get_actions()
  │     └── risk_explanation resolved via policy engine
  └── post_action()
        ├── State loaded early (for event metadata)
        ├── Confirmation gate logs `confirmation_required`
        │     └── returns needs_approval response
        ├── Confirmed-risky branch writes approvals.json
        │     └── emits `action_approved` event
        ├── Adapter dispatch (unchanged flow)
        ├── Navigation (unchanged)
        └── System actions (unchanged)

risk-confirmation-dialog.tsx (modified)
  ├── Enter-key shortcut on DialogContent
  ├── aria-describedby binding
  ├── handleDismiss (local-only, no API call)
  ├── handleProceed (always sends confirmed:true)
  └── Error path removed from dialog body

command-pane.tsx (modified)
  ├── Action handler: risk check before adapter check
  └── Filters: riskyActions catches ALL risk_category
        (adapter + system); adapterActions excludes risky
```

## Decision Table Compliance

| Trigger | Backend event | approvals.json write | API call | UI behaviour | Status |
|---|---|---|---|---|---|
| Unconfirmed risky action | `confirmation_required` | No | POST → `needs_approval` | Dialog opens with risk explanation | ✅ |
| Confirmed risky action | `action_approved` + transition events | Yes (before dispatch) | POST → `ok` | Dialog closes, toast success | ✅ |
| Non-risky action (`confirmed: true/false`) | Transition events only | No | POST → `ok` | Normal flow, no dialog | ✅ |
| Cancel/Escape | — none — | No | No request | Dialog closes, neutral toast | ✅ |
| Invalid-stage action | `INVALID_TRANSITION` error | No | POST → 400 | Error toast | ✅ |
| Unknown action | `UNKNOWN_ACTION` error | No | POST → 400 | Error toast | ✅ |

## New Files (4)

| File | Purpose |
|------|---------|
| `services/orchestrator/policies.py` | `@cache`-decorated `load_policies()`, plus `requires_confirmation()`, `get_risk_explanation()`, `get_category()` |
| `apps/web/jest.config.js` | Next.js Jest config with jsdom, `@/` path mapping, `setupFilesAfterEnv` |
| `apps/web/src/__tests__/setup.ts` | Import `@testing-library/jest-dom` matchers |
| `apps/web/src/__tests__/risk-confirmation-dialog.test.tsx` | 9 dialog unit tests (see §Frontend test table) |

## Modified Files (5)

| File | Change |
|------|--------|
| `services/orchestrator/api/actions.py` | Replaced inline `policies.json` read with shared `requires_confirmation()` / `get_risk_explanation()`; policy-resolved `risk_explanation` in `get_actions` and `needs_approval` response; logs `confirmation_required` / `action_approved` events; writes `ApprovalRecord` on confirmed gate pass; skips approval artifacts/events on non-risky actions; state loaded early for event metadata |
| `services/orchestrator/services/action_service.py` | Replaced `_requires_confirmation()` method with shared `requires_confirmation()` import; silent defense-in-depth gate preserved |
| `apps/web/src/components/risk-confirmation-dialog.tsx` | Enter-key shortcut on `DialogContent`; `aria-describedby` binding; local-only `handleDismiss` (no API call, neutral toast); `handleProceed` always sends `confirmed: true`; removed `needs_approval` error branch |
| `apps/web/src/components/command-pane.tsx` | Action handler reordered: risk check before adapter check; `riskyActions` filter catches ALL `risk_category` entries; `adapterActions` excludes risky entries |
| `apps/web/package.json` | Added test scripts (`test`, `test:watch`) and devDependencies (`jest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jest-environment-jsdom`) |

## Key Components

### `policies.py` (shared cached policy module)

Module-level `@cache`-decorated `load_policies()` reads `config/policies.json` once on first call. Three public functions:

- **`requires_confirmation(risk_category)`** — returns `True`/`False` from policy config. Unknown categories return `False`.
- **`get_risk_explanation(risk_category, action_entry?)`** — action-specific override → category default → `"Proceed with caution."` fallback.
- **`get_category(risk_category)`** — returns the full category dict or `None`.

Both `actions.py` and `action_service.py` call these functions, replacing inline file reads.

### Confirmation gate flow (`actions.py`)

```
post_action(action, body)
  │
  ├─ Load state early (for from_state / phase_id)
  │
  ├─ risk_category from action_entry
  │
  ├─ requires_confirmation? AND not body.confirmed?
  │     ├─ log confirmation_required event (level: warning)
  │     └─ return { status: "needs_approval", risk_explanation, ... }
  │
  ├─ confirmed_risky? (risk_category + requires + body.confirmed)
  │     ├─ write ApprovalRecord to approvals.json
  │     ├─ log action_approved event (level: info, to_state: null)
  │     └─ fall through to adapter/navigation/system branches
  │
  └─ Non-risky actions: skip all approval artifacts/events
        (confirmed flag silently ignored)
```

### Dialog: local-only dismissal

Cancel and Escape are purely local UI actions — no API request, no audit event. `handleDismiss` calls `onOpenChange(false)` and shows a neutral toast `"Action cancelled."`. Focus restoration is handled by Radix Dialog's built-in focus management.

### Command pane reorder

Risk check moves before adapter check in `handleAction`:

```
navigation? → return
risk_category? → open dialog, return
adapter? → dispatch, return
system action → postAction, return
```

Filter fix: `riskyActions` now catches ALL `a.risk_category` entries (both system and adapter). `adapterActions` filters to `!a.risk_category` only, so risky adapter actions appear under "Risky actions".

## Test Coverage

### Backend — 180 tests pass (10 in TestSystemConfirmation)

| Test | Coverage |
|------|----------|
| `test_risky_adapter_requires_confirmation` | Adapter action without confirm → `needs_approval`, state unchanged |
| `test_confirmation_required_event_logged` | `confirmation_required` event written to event log |
| `test_action_approved_event_logged` | `action_approved` event written on confirmed pass |
| `test_approvals_artifact_written` | `approvals.json` exists with valid `ApprovalRecord` |
| `test_non_risky_confirmed_creates_no_approval_audit` | Non-risky action: no approval file, no approval events |
| `test_invalid_stage_creates_no_approval_audit` | Invalid-stage: 400, no approvals, no new events |

### Frontend — 9 dialog tests pass

| Test | Assertion |
|------|-----------|
| `renders with action label and risk explanation` | Title = label, body shows explanation |
| `renders with fallback explanation` | Body shows "Are you sure?" |
| `cancel closes dialog without API call` | `onOpenChange(false)`, `postAction` NOT called |
| `escape key dismisses without API call` | `onOpenChange(false)`, `postAction` NOT called |
| `proceed dispatches with confirmed` | `postAction` called with `confirmed: true` |
| `shows loading state during dispatch` | Button shows "Processing...", disabled |
| `shows error on failure and closes dialog` | Error toast shown, dialog closed |
| `enter key proceeds` | `postAction` called |
| `does not render when action is null` | Returns null |

## Verification

```
pytest                              → 180 passed
ruff check .                        → All checks passed
cd apps/web && npm test             → 9 passed
cd apps/web && npm run build        → Compiled successfully
```

## Handoff Note: Phase 4 Timeline and Dismissal Events

The Phase 4 timeline (`docs/build/phase-4-build.md`, "Timeline Event Log" section) must continue to show **only backend event-log entries** (`action_executed`, `INVALID_TRANSITION`, `PHASE_ERROR`). Dialog dismissal (Cancel/Escape) is a purely local UI action that produces **no event** — the timeline must never surface it. This is by design: the backend is the safety authority, and local dismissal events would pollute the audit record with noise. **Do not add dismissal logging later unless scope explicitly changes.** No approval artifact is written for non-risky or invalid-stage paths, regardless of `confirmed` flag.

## Review Findings and Fixes

A post-implementation review against the approved plan identified 1 issue. All were corrected:

| # | Issue | Fix |
|---|-------|------|
| 1 | `test_invalid_stage_creates_no_approval_audit` missing `events_before`/`events_after` assertion — didn't verify zero new events on invalid-stage 400 | Restored assertion to match plan test code |

### Accepted Config Deviations (Intentional, Reviewed and Signed Off)

All deviations below were identified during implementation and accepted. No further config alignment needed.

| Requirement | Deviation | Rationale |
|-------------|-----------|-----------|
| `jest.config.ts` (plan §5.10) | Created as `jest.config.js` | `ts-node` not installed; `.js` works without it |
| `setupFilesAfterSetup` (plan §5.10) | Used `setupFilesAfterEnv` | Plan had a typo; `setupFilesAfterSetup` is not a valid Jest 29 option |
| `setup.ts` moduleNameMapper (plan §5.10) | Added `moduleNameMapper` for `@/` paths | Required for path alias resolution |
| Local import of `ApprovalRecord` (plan §5.4) | Top-level import | Cleaner; no behavioral change |
| `toast("Action cancelled.", "neutral")` (plan §5.7) | `toast("Action cancelled.")` without variant | Toast utility only has `default`/`destructive`; default styling is neutral |

**Commit**: `b18919b`
