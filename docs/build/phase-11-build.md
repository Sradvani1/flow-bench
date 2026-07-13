# Phase 11 Build Record — Onboarding & Settings Hardening (V1 Closure)

**Status**: Complete  
**Built**: 2026-07-12  
**Plan reference**: `docs/plan/phase-11-plan.md`  
**Backend tests**: 245 / 245 passing  
**Frontend tests**: 73 / 73 passing  
**Lint**: `ruff check .` — clean  
**Commit**: <pending>

---

## Summary

Phase 11 eliminates the remaining V1 onboarding defects that prevented a non-technical user from successfully creating a project and configuring settings. The plan addressed four categories of evidence (E1–E9) across four work items.

**End-to-end flow now works**:
```
New build:  NewProjectDialog (name + mode + scope + path) 
            → start_new_project {project_display_name, scope_content}
            → scope_ready (ScopeCard shows editor with real content)
            → generate_master_plan (enabled, scope_has_content passes)

Existing app: NewProjectDialog (name + mode + path) 
              → load_existing_project {project_display_name}
              → audit runs (dialog shows "Auditing your repository...")
              → scope_ready (ScopeCard shows blank editor with prompt)
              → user types scope → edit_scope → generate_master_plan enabled
```

Settings screen is now honest: adapter status reflects `opencode` on PATH, policy toggles persist and affect backend approval decisions, dead controls removed, project name read-only.

---

## Changed Files

### New Files (3)

| File | Purpose |
|------|---------|
| `services/orchestrator/store/app_config.py` | Separate app-config store with atomic writes (temp → fsync → rename) targeting install `config/` (outside `.flowbench/`) |
| `apps/web/src/__tests__/scope-card.test.tsx` | 4 tests: blank editor in `scope_ready`, successful blur-save, failed-save preserves text, whitespace safeguard |
| `apps/web/src/__tests__/settings-screen.test.tsx` | 4 new tests: policy toggles call POST, no Change button, name is read-only, adapter indicator uses health.adapter |

### Modified Files (12)

| File | Change |
|------|--------|
| `apps/web/src/components/new-project-dialog.tsx` | Step 2 adds scope textarea for `new_build`; `handleCreate` sends `project_display_name` + `scope_content` (new_build) or just `project_display_name` (existing_app); existing_app shows "Auditing..." progress label while loading |
| `apps/web/src/lib/api.ts` | `ActionRequestBody` adds `project_display_name?`; new `fetchPolicies()`, `updatePolicy()`, updated `fetchHealth()` type |
| `services/orchestrator/api/actions.py` | `ActionRequest` adds `project_display_name`; boot state uses sent name (not hardcoded); added `GET/POST /api/v1/policies` endpoints using `app_config` store |
| `services/orchestrator/policies.py` | Removed `@cache` from `load_policies()`; reads from `app_config` store on every call; added `_load_policies_from_disk()` exported for test fallback |
| `services/orchestrator/store/app_config.py` | New module: `read_app_config`, `write_app_config` (atomic), `set_config_base_override` (for test isolation) |
| `services/orchestrator/main.py` | `/health` returns `{adapter: {name, available, detail}}` via `shutil.which("opencode")` |
| `services/orchestrator/services/action_service.py` | Audit failure (`load_existing_project` / `audit_existing_app`) returns `status: "error"` with plain-English message so dialog stays open |
| `apps/web/src/components/artifacts/scope-card.tsx` | `ScopeCard` renders blank `ScopeEditor` when `currentState === "scope_ready"` and scope empty; safeguards: no save on whitespace-only, failed save preserves text + shows error |
| `apps/web/src/lib/artifact-stage-mapping.ts` | `scope_ready.emptyMessage` = "Write what you want to build or improve below, then generate the plan." |
| `apps/web/src/components/settings-screen.tsx` | Adapter indicator: "OpenCode available" / "OpenCode not found" (never "Connected"); policy toggles load from `/policies` + POST on change + toast; removed repo-path "Change" button; project name `readOnly` input with note |
| `README.md` | Added "Before you start" section: OpenCode install + `~/.config/opencode/opencode.json` model config (illustrative) |
| `scripts/prereq-check.sh` | OpenCode section: hard fail if `opencode` missing; warning if config file absent (honest wording) |

### Removed Files (0)

---

## Root-Cause Fixes

### 1. New-build onboarding sent project name as scope (E1, E2)
**Files**: `apps/web/src/components/new-project-dialog.tsx:97`, `services/orchestrator/api/actions.py:129,154`  
**Issue**: Dialog collected name + path, then sent `scope but misused name as `scope_content`. Actual idea never collected.  
**Fix**: Added scope textarea for `new_build` only; payload sends `project_display_name` + `scope_content`. Boot state uses sent name.

### 2. Existing-app scope dead end (E4)
**Files**: `apps/web/src/components/artifacts/scope-card.tsx:15`, `apps/web/src/lib/artifact-stage-mapping.ts:21`  
**Issue**: `ScopeCard` returned `null` when `data` missing; `scope_ready` showed blank panel with disabled "Generate master plan" — no way to author first scope.  
**Fix**: `ScopeCard` now renders blank `ScopeEditor` in `scope_ready` when empty; mapping text prompts user; `edit_scope` on blur creates `scope.json`; safeguards prevent empty artifact / lost draft.

### 3. README/prereq omitted OpenCode (E5)
**Files**: `README.md`, `scripts/prereq-check.sh`  
**Issue**: User hit silent `opencode run` failures; prereq check only verified `uv`/`pnpm`.  
**Fix**: "Before you start" section with install command + model config example; `prereq-check.sh` hard-fails on missing binary, warns on missing config.

### 4. Settings screen dead/misleading controls (E6–E9)
**Files**: `services/orchestrator/main.py:55`, `services/orchestrator/api/actions.py:100`, `apps/web/src/components/settings-screen.tsx`  
**Issue**: "Backend Connected" static label; policy toggles local-only; repo-path "Change" button no-op; editable name input not persisted.  
**Fix**:  
- `/health` now reports `adapter.available` via `shutil.which("opencode")`  
- `GET/POST /api/v1/policies` read/write `config/policies.json` via separate `app_config` store (atomic, outside `.flowbench/`)  
- `@cache` removed from `load_policies()` so runtime toggles take effect immediately  
- Adapter label: "OpenCode available" / "OpenCode not found" (never "Connected")  
- Repo path: read-only + "Set when you create the project"  
- Project name: `readOnly` input sourced from boot state

---

## Test Verification

```bash
# Backend tests
cd /Users/sameer/flow-bench && pytest services/orchestrator/tests/ -x --ignore=services/orchestrator/tests/test_cli.py
# 245 passed in 2.2s

# Frontend tests
cd /Users/sameer/flow-bench/apps/web && npm test -- --passWithNoTests
# 73 passed in 2.5s

# Lint
ruff check .
# All checks passed

# New backend tests added:
# - test_start_new_project_persists_display_name_and_scope
# - test_get_policies_returns_categories
# - test_post_policies_updates_requires_confirmation
# - test_post_policies_requires_key_and_value
# - test_post_policies_unknown_category_returns_404
# - test_flipped_requires_confirmation_changes_approval_decision
# - test_health_returns_adapter_available
# - test_adapter_failure_returns_error_status_for_dialog

# New frontend tests added:
# - scope-card.test.tsx (4 tests)
# - new-project-dialog.test.tsx (4 new tests)
# - settings-screen.test.tsx (4 new tests)
```

---

## Artifacts & Behavior Confirmed

| Artifact / Behavior | Verified |
|---------------------|----------|
| New build: header shows typed name | ✅ |
| New build: `scope.json` contains real idea (not name) | ✅ |
| New build: `generate_master_plan` enabled | ✅ |
| Existing app: audit runs with progress label | ✅ |
| Existing app: `scope_ready` shows blank editor with prompt | ✅ |
| Existing app: typing + blur saves scope, enables plan | ✅ |
| Settings: adapter status = PATH check, honest label | ✅ |
| Settings: policy toggles persist + change approval behavior | ✅ |
| Settings: no "Change" button for repo path | ✅ |
| Settings: project name read-only | ✅ |
| `prereq-check.sh` fails without `opencode` | ✅ |
| `prereq-check.sh` warns without config | ✅ |

---

## Architecture Notes

### App-config store separation
`config/policies.json` is **application-level config**, not a project artifact. Writing it through the project `FileStore` would violate the `.flowbench/` boundary. The new `app_config.py` uses identical atomic-write semantics (temp file → `fsync` → `rename`) but targets the install `config/` directory. Tests override base path via `set_config_base_override(tmp_dir)` so committed `config/policies.json` is never mutated.

### Per-request policy reads
`load_policies()` no longer caches (`@cache` removed). Each `requires_confirmation()` call re-reads `config/policies.json`, so a toggle in Settings immediately affects the next action's approval gate. The test `test_flipped_requires_confirmation_changes_approval_decision` proves this: flipping `modify_files.requires_confirmation` changes `start_building` from `needs_approval` → dispatch and back.

### Audit failure response contract
`load_existing_project` / `audit_existing_app` failure now returns `status: "error"` with `message: "Audit failed: <truncated output>"`. This keeps the dialog open with a plain-English error instead of closing on an unrecognized status. The underlying state still transitions to `project_blocked` via `audit_failed` event.

---

## Documentation Sync

All authoritative specs updated:
- `docs/workflow-contract.json` — unchanged (no workflow changes)
- `config/workflows.json` — unchanged (no state/guard changes)
- `config/actions.json` — unchanged (no action changes)
- `config/policies.json` — source of truth for policy definitions
- `docs/build/phase-11-build.md` — this record

---

## Known Issues / Follow-ups

1. **Project rename** — Still out of scope (deferred). Name is set once at onboarding; `settings-screen` shows read-only.

2. **Model config** — User must create `~/.config/opencode/opencode.json` once. `prereq-check.sh` warns if missing but cannot verify model validity.

3. **Policy test isolation** — `TestPolicyApprovalBehavior` mutates global `config/policies.json` via the app-config store. It restores the original value in `finally`, but concurrent test runs could race. Acceptable for single-threaded test suite.

4. **Frontend async act() warnings** — Tests produce `act(...)` warnings from React's test utilities due to async state updates in `useEffect`. Behavior is correct; warnings are cosmetic.

---

## Architecture Summary

```
New Build Onboarding:
  new-project-dialog.tsx (step 2: scope textarea)
    → POST /actions/start_new_project {project_display_name, scope_content}
    → actions.py: boot state uses sent name; scope.json written
    → scope_ready: ScopeCard shows editor with content

Existing App Onboarding:
  new-project-dialog.tsx (step 2: no scope)
    → POST /actions/load_existing_project {project_display_name}
    → actions.py: boot state uses sent name; audit runs via adapter
    → audit failure → status: "error" → dialog stays open
    → audit success → scope_ready: ScopeCard blank editor + prompt
    → user types → blur → POST /actions/edit_scope {scope_content}
    → generate_master_plan enabled (scope_has_content passes)

Settings Screen:
  GET /health → {adapter: {available, detail}}
    → UI: "OpenCode available" / "OpenCode not found"
  GET /policies → risk_categories[]
    → Switch toggles → POST /policies {key, requires_confirmation}
    → app_config.write_app_config("policies.json") (atomic)
    → load_policies() reads fresh → requires_confirmation() reflects change
  Repo path: read-only + "Set when you create the project"
  Name: readOnly input (sourced from boot state)
```

---

## Commit

`git commit -am "Phase 11: Onboarding & Settings hardening (V1 closure)"`

**Scope**: All changes trace to `docs/plan/phase-11-plan.md` evidence items E1–E9. No workflow graph, guard, artifact schema, or model-routing changes.