# FlowBench — Implementation Master Plan v3.0

> Generated from FlowBench Product Scope v2.0.md
> Sharpened by review feedback — 26 architecture decisions applied
> **Authoritative reference: workflow-contract.json**

---

## Methodology

FlowBench is built using the same master-plan-and-phase loop it orchestrates. Each phase runs through: **plan → sharpen → build → review → test → fix → handoff**.

## Authoritative Source of Truth

**[workflow-contract.json](./workflow-contract.json)** is the single authoritative document that defines every state, action, transition, artifact, event, and recovery path. It validates:
- `config/workflows.json` — transition graph
- `config/actions.json` — action catalog and risk definitions
- State machine tests — every transition must match the contract
- API responses — state labels, action labels
- UI rendering — command pane actions, artifact selection, blocked state recovery

If any conflict exists between this master plan and the workflow contract, **the contract wins**.

---

## Key Changes from Review Feedback

| Area | Before | After |
|------|--------|-------|
| **Approval model** | Adapter returns `proposed_risky_actions` mid-execution; `phase_awaiting_approval` state; resume model | Stage-level approval: risk categories declared per-action in `actions.json`; UI confirms before dispatch; adapter never flags risks; no resume model |
| **Run persistence** | Not defined | `RunRecord` for every adapter action; single-active-run lock; interrupted runs detected on startup; recovery prompt (never auto-rerun) |
| **Context bundles** | Implicit | Explicit context bundle rules per adapter action in workflow-contract.json |
| **Phase 2/4 split** | Overlapping (both built artifact rendering) | Phase 2 = console shell + header + command pane + placeholders only; Phase 4 = all artifact renderers + timeline |
| **Skip/reorder rules** | Not defined | Explicit: only upcoming phases reordered; skip requires reason; skipped phases can be restored |
| **Safety constraints** | Not defined | 127.0.0.1 binding, path validation, symlink resolution, artifact boundary, secret scrubbing, HTML escaping |
| **Adapter execution** | `adapter_not_available` for all adapter actions (Phase 1) | `OpenCodeAdapter` registered in lifespan; full preflight/commit pipeline with context bundles, RunRecord metadata, structured output protocol, two-phase lifecycle |

---

## Phase Status

| Phase | Description | Status | Notes |
|-------|-------------|--------|-------|
| 1 | Core state machine, API, FileStore, EventLog, RunStore | ✅ Complete | All tests pass (246/246) |
| 2 | Frontend console shell (header, command pane, queue panel, artifact panel, blocked/recovery) | ✅ Complete | Phase 9 implementation |
| 3 | **Adapter dispatch pipeline** (preflight/commit, context bundles, RunRecord, OpenCodeAdapter) | ✅ Complete | `OpenCodeAdapter` registered, end-to-end flow works |
| 4 | Artifact renderers, timeline, stage-to-artifact mapping | ✅ Complete | Phase 9 implementation |
| 5 | Policy engine, approval audit events, dialog polish | ✅ Complete | Policy engine + audit events + dialog polish |
| 6 | Existing app mode: audit service, context injection | ✅ Complete | `load_existing_project` works end-to-end |
| 7 | CLI, recovery UI, safety enforcement, golden-path tests, docs | ✅ Complete | `flowbench` CLI, recovery UI, safety, smoke tests |
| 8 | Auto-dispatch for review/test with fix-cycle support | ✅ Complete | Review → test → handoff auto-dispatch chain |
| **Atomic writes** | Not defined | Write temp → fsync → rename; events only after durable write |
| **Schema versioning** | Not defined | `schema_version` field on every top-level artifact (starts at 1) |
| **AdopterResult** | Had `proposed_risky_actions` | Removed — risk detection is config-driven, not adapter-driven |
| **Golden-path tests** | Implicit | 6 explicit tests defined in workflow-contract.json |
| **Phase 1 adapter scope** | Phase 1 implied full adapter-backed dispatch | Phase 1 returns `adapter_not_available` for all adapter-backed actions; only state-only actions execute; full dispatch pipeline deferred to Phase 3 |
| **Approval ownership** | Spread across phases 2/3/5 | Phase 2: UI dialog shell (mocked data). Phase 3: backend enforcement gate. Phase 5: policy config, explanations, audit events, tests. Backend is safety authority. |
| **Recovery semantics** | Vague "retry" and "continue" | Four precise recovery choices defined in workflow-contract.json with exact meaning and safety rules. Retry = new RunRecord with fresh context, never reuse stale state. |
| **Artifact layout** | Ambiguous `~/.flowbench/projects/{name}/` path | Locked to `<repo>/.flowbench/` flat namespace. No project-name subdirectory. Phase-specific artifacts use `<type>-<phase-id>.json`. Future multi-project requires separate scope decision. |
| **RunRecord** | `command_context_hash` not defined | Added: sha256 of assembled context bundle. Enables tracing retries while confirming fresh context. Status transition table: terminal states never → running; retry creates new record. |

---

## Safety Constraints (Applied Across All Phases)

- Bind FastAPI to `127.0.0.1` only
- Validate and normalize repo paths before use; resolve symlinks
- All artifact writes restricted to `<repo>/.flowbench/` directory tree
- Never persist secrets in artifacts, prompts, logs, or UI messages
- Treat all artifact content as untrusted text when rendering (escape HTML)
- Record command template version and working directory in each RunRecord
- Atomic writes: write temp file → fsync → rename into place
- Events appended only after durable artifact write succeeds
- Backend is the safety authority for approval; UI is a convenience layer — a risky action is never accepted merely because a client claims prior confirmation

---

## Phase Management Rules

- Only upcoming phases can be reordered
- A phase cannot move ahead of an unmet dependency (V1 sequential — reorder is a UI affordance)
- Skipping requires a plain-English reason recorded in a decision artifact
- Skipped phases remain visible with status `skipped`
- Skipped phases can be restored to `upcoming` before `project_complete`
- Any reorder or skip action creates an event log entry and a decision artifact
- Override-and-continue in review/test requires a plain-English reason

---

## Sharpness Criteria

A plan is ready for acceptance only when ALL of these are true:

1. The goal is clearly stated
2. Non-goals are explicitly listed
3. Dependencies are known and documented
4. Acceptance checks are concrete and testable
5. Builder decisions required during this phase are listed separately
6. Existing behavior to preserve is stated (in existing-app mode)
7. The next action after this plan is obvious
8. Unresolved blockers are either cleared or explicitly called out with their impact

---

## Build Phases

---

### Phase 1 — Foundation: State Machine, Schemas, Run Persistence, and Event Log

**Estimated complexity:** High  
**Dependencies:** None  
**Deliverable:** Read-oriented FastAPI service with pure-logic state machines, versioned Pydantic schemas, atomic file store (flat `.flowbench/` layout), RunRecord persistence with `command_context_hash`, event log, and workflow contract validation harness. `POST /actions` returns `adapter_not_available` for adapter-backed actions. No adapter execution. No UI.

**What changed from v3:** `POST /actions` no longer attempts real adapter dispatch. Adapter-backed actions return `adapter_not_available` with plain English explanation. Only state-only (`system`, `navigation`) actions execute and transition. No RunRecord is created by any action endpoint in Phase 1 (the run store is tested independently). Full dispatch pipeline (approval check + RunRecord creation + adapter call + artifact persistence + state transition + event logging) is deferred to Phase 3. `command_context_hash` added to RunRecord schema.

#### Success Criteria

- Both state machines govern all transitions from workflow-contract.json
- Invalid transitions rejected with clear plain English error
- All state persists atomically and survives restart
- Event log records every transition
- RunRecord store implemented; single-active-run lock enforced; interrupted runs detected on startup
- Schema versioning on all persisted artifacts
- Workflow contract validation tests pass
- `POST /actions` returns `adapter_not_available` for adapter-backed actions; only state-only and navigation actions execute
- Adapter-backed actions do not execute, create no RunRecord, and do not change state
- Server bound to 127.0.0.1

#### Sub-Tasks

##### 1.1 — Monorepo scaffolding

**Files:** `pyproject.toml`, `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/tailwind.config.ts`, `config/*.json`, `config/adapters/opencode.json`

**Success:** Both projects init without errors. Linting passes. Directory tree matches contract.

##### 1.2 — Pydantic schemas with schema versioning

**Files:** `services/orchestrator/schemas/state.py`, `artifacts.py`, `events.py`, `approvals.py`, `adapter.py`, `run_record.py`

**Success:** All schemas defined with `schema_version: int`. RunRecord with all required fields. Serialize/deserialize correctly.

##### 1.3 — Pure two-level state machine engine

**Files:** `services/orchestrator/engine/state_machine.py`, `project_machine.py`, `phase_machine.py`, `guards.py`, `config/workflows.json`

**Success:** Zero I/O. All transitions from contract. Invalid transitions raise `StateTransitionError`.

##### 1.4 — Atomic file store (flat .flowbench/ layout)

**Files:** `services/orchestrator/store/file_store.py`, `event_log.py`

**Success:** Write temp → fsync → rename. Events only after durable artifact write. All writes within `<repo>/.flowbench/`. Flat namespace (phase-specific files use `<type>-<phase-id>.json`).

##### 1.5 — RunRecord persistence and recovery

**Files:** `services/orchestrator/store/run_store.py`, `services/run_service.py`, `api/runs.py`

**Success:** RunRecord per action with `command_context_hash`. Single-active-run lock. Startup recovery detection. Status transitions follow contract (terminal states never → running; retry creates new record). Never auto-rerun.

##### 1.6 — FastAPI service (read-oriented, no adapter dispatch)

**Files:** `services/orchestrator/main.py`, `api/state.py`, `api/actions.py`, `api/events.py`, `api/runs.py`

**Success:** GET endpoints return correct data. `POST /actions` returns `adapter_not_available` for adapter-backed actions (no state change, no RunRecord). State-only actions (`system`, `navigation`) execute and transition. Invalid transitions return 400. No RunRecord created by any action endpoint. Bound to 127.0.0.1.

##### 1.7 — Config files

**Files:** `config/workflows.json`, `config/actions.json`, `config/policies.json`, `config/project-modes.json`, `config/adapters/opencode.json`

**Success:** Match workflow-contract.json exactly. Risk categories declared per-action.

##### 1.8 — Workflow contract validation tests

**Files:** `services/orchestrator/tests/test_workflow_contract.py`

**Success:** Complete coverage of contract rules. Build fails on violation. Data-driven.

##### 1.9 — Unit and API tests

**Files:** `services/orchestrator/tests/test_state_machine.py`, `test_file_store.py`, `test_schemas.py`, `test_run_store.py`, `test_api.py`

**Success:** >95% coverage on engine/ and store/. State machine has no fixtures.

---

### Phase 2 — Console UI: Shell, Navigation, and Base Layout

**Estimated complexity:** High  
**Dependencies:** Phase 1  
**Deliverable:** Console shell with three-pane layout, header, stage-aware command pane with risk confirmation dialog, placeholder artifact area, basic phase queue, settings entry point.

**What changed from v2:** Strictly limited to shell/placeholders. All artifact rendering deferred to Phase 4. Risk confirmation dialog added. No timeline yet.

#### Success Criteria

- Three-pane layout renders correctly
- Command pane shows only stage-valid actions from workflow-contract.json
- Risky actions show confirmation dialog before dispatch
- Rejecting does nothing. Approving dispatches to backend.
- Phase queue as simple list with color-coded status
- Artifact area shows placeholder (raw JSON or 'No artifact yet')
- Polling at 2s/5s with ETag short-circuit
- Light and dark mode

#### Sub-Tasks

##### 2.1 — Next.js + shadcn/ui + TanStack Query base layout

**Files:** `apps/web/package.json`, `layout.tsx`, `globals.css`

**Success:** App starts. Three-pane layout. Dark mode. Exactly 12 shadcn/ui components.

##### 2.2 — Project header with adaptive polling

**Files:** `components/project-header.tsx`, `hooks/use-project-state.ts`

**Success:** All header fields. Polling switches 2s/5s. No unnecessary re-renders.

##### 2.3 — Stage-aware command pane with risk confirmation (UI shell only)

**Files:** `components/command-pane.tsx`, `components/risk-confirmation-dialog.tsx`, `hooks/use-actions.ts`

**Success:** Only valid actions. Risk dialog shows for risky actions (may use hardcoded risk explanations). Reject → no-op. Approve → POST with `confirmed:true`. Backend enforcement of confirmed flag is NOT expected yet — that is Phase 3. Phase 1 backend returns `adapter_not_available` for adapter actions, which is expected behavior.

##### 2.4 — Placeholder artifact area and basic phase queue

**Files:** `components/artifact-panel.tsx`, `components/phase-queue.tsx`, `hooks/use-phase-queue.ts`

**Success:** JSON dump or empty state. Phase list with color badges. Deferred to Phase 4.

##### 2.5 — Settings button and page entry point

**Files:** `components/settings-screen.tsx`

**Success:** Settings renders and saves. Path validates.

---

### Phase 3 — OpenCode Adapter: Execution Backend Integration

**FlowBench ownership boundary:** FlowBench is the system of record for workflow state, state transitions, artifacts, events, and run lifecycle. Adapters do not own workflow truth. They return execution results that FlowBench validates, persists, and translates into state changes according to the workflow contract. OpenCode is adapter one under that boundary — it does not own workflow state or orchestration.

**Estimated complexity:** High  
**Dependencies:** Phase 1  
**Deliverable:** All ExecutionAdapter methods for OpenCode. 10 command templates with `$variable` syntax. RunRecord integration. AdapterResult without risk flags.

**What changed from v2:** `proposed_risky_actions` removed from AdapterResult. Risk detection is purely config-driven. RunRecord integration added. No `phase_awaiting_approval` wiring.

#### Success Criteria

- All adapter methods execute OpenCode CLI
- Command templates use `$variable` syntax, discovered via glob
- Structured output from temp file + stdout fallback
- Per-method timeouts from config
- AdapterResult has no risk fields
- RunRecord created for every call

#### Sub-Tasks

##### 3.1 — ExecutionAdapter interface (revised)

**Files:** `services/orchestrator/adapters/base.py`, `registry.py`

**Success:** No risk fields in AdapterResult. Registry works.

##### 3.2 — OpenCode adapter implementation

**Files:** `adapters/opencode/adapter.py`, `command_builder.py`, `config/adapters/opencode.json`

**Success:** All methods execute. RunRecord integration. No risk flagging.

##### 3.3 — 10 OpenCode command templates

**Files:** `adapters/opencode/commands/*.md`

**Success:** `$variable` syntax. `@return` block. Context bundles per contract.

##### 3.4 — Wire adapter into API (full dispatch pipeline)

**Files:** `api/actions.py`, `services/action_service.py`

**Success:** Full pipeline: validate stage → check risk_category → enforce confirmed flag (backend is safety authority) → check single-active-run lock → create RunRecord → assemble context bundle (with `command_context_hash`) → call adapter → persist artifact → update state → log event → complete RunRecord. Unconfirmed risky returns `confirmation_required`. Confirmed or non-risky dispatches. Timeout → RunRecord `timed_out`. Failure → blocked state.

##### 3.5 — Adapter tests

**Files:** `tests/test_opencode_adapter.py`, `test_command_builder.py`

**Success:** All methods tested. No risk fields confirmed. RunRecord verified.

---

### Phase 4 — Artifacts and Timeline: Full Rendering and History

**Estimated complexity:** Medium  
**Dependencies:** Phases 2, 3  
**Deliverable:** 10 artifact renderers, stage-aware auto-selection, empty-state cards, paginated timeline with level filtering.

**What changed from v2:** Phase 2 no longer overlaps — Phase 4 owns all artifact rendering and timeline. Empty-state cards added.

#### Success Criteria

- Every artifact type renders as formatted plain English card
- Auto-selection correct for every state
- All artifacts read-only (Scope editable in `scope_ready`)
- Empty states show suggested action
- Timeline: 50/page, Load more, level filter

#### Sub-Tasks

##### 4.1 — 10 artifact renderers and empty-state cards

**Files:** `components/artifacts/*.tsx`

**Success:** Each type renders correctly. Empty states helpful.

##### 4.2 — Stage-to-artifact auto-selection

**Files:** `hooks/use-current-artifact.ts`, `lib/artifact-stage-mapping.ts`

**Success:** Data-driven mapping. Missing artifacts show empty state.

##### 4.3 — Paginated timeline with level filtering

**Files:** `components/project-timeline.tsx`, `hooks/use-events.ts`

**Success:** 50/page. Load more. Level filter tabs.

---

### Phase 5 — Approval System: Policy Config, Audit Events, and Dialog Polish

**Estimated complexity:** Medium  
**Dependencies:** Phases 2, 3  
**Deliverable:** Shared policy engine (risk category definitions + explanation generation), approval audit events, polished UI dialog, acceptance tests. The backend enforcement gate was built in Phase 3.4. The UI dialog shell was built in Phase 2.3. This phase closes the remaining loop.

**What changed from v3:** Reduced scope. No longer builds the backend approval gate (that's Phase 3). Now focused on: policy engine as shared library, audit event logging, UI dialog polish (keyboard shortcuts, accessibility, verbatim rendering), and acceptance tests.

#### Success Criteria

- Policy engine provides `get_risk_explanation()` consumed by both API and UI
- Audit events logged for `action_approved` (confirmed risky) and `confirmation_required` (unconfirmed risky). Dialog dismissals produce no event — purely local UI.
- UI dialog renders `risk_explanation` verbatim from backend policy engine
- Dialog has Enter=approve, Escape dismisses locally with neutral feedback
- Dialog is accessible (ARIA labels, focus trap)
- `adapter_not_available` shown clearly if backend returns it
- Approval acceptance tests pass (full flow: API enforcement + dialog)

#### Sub-Tasks

##### 5.1 — Policy engine — risk category definitions and explanation generation

**Files:** `services/orchestrator/policies.py`, `config/policies.json`

**Success:** Loads from config. `get_risk_explanation()` shared by API and UI. No adapter output inspection.

##### 5.2 — Approval audit events

**Files:** `api/actions.py`, `services/action_service.py`

**Success:** Events logged for `confirmation_required` returns and `action_approved` dispatches. Dismissed dialogs produce no event — purely local UI action. Timeline (Phase 4) renders events from the event log only; dismissal events never appear.

##### 5.3 — UI dialog polish — keyboard, accessibility, verbatim rendering

**Files:** `components/risk-confirmation-dialog.tsx`

**Success:** `risk_explanation` verbatim from backend. Enter/escape shortcuts. ARIA labels + focus trap. Clear rejection message. `adapter_not_available` shown clearly.

##### 5.4 — Approval acceptance tests

**Files:** tests added to existing `services/orchestrator/tests/test_api.py`, `src/__tests__/risk-confirmation-dialog.test.tsx`

**Success:** API-level (unconfirmed → confirmation_required, confirmed → dispatch, non-risky → direct). UI-level (dialog appears for risky, not for non-risky, approve/reject paths). Backend safety authority verified (confirmed flag ignored for non-risky actions). Invalid stage rejection verified.

---

### Phase 6 — Existing App Mode: App Audit and Context Injection

**Estimated complexity:** Medium  
**Dependencies:** Phases 1, 3  
**Deliverable:** 5-section app audit, existing-app init, context injection per contract rules.

**What changed from v2:** Context injection now explicitly follows `workflow-contract.json` `context_bundle_rules`.

#### Success Criteria

- 5-section audit report
- Git not required
- Audit context injected per contract rules
- new_build mode never includes audit context

#### Sub-Tasks

##### 6.1 — App audit service

**Files:** `services/audit_service.py`

**Success:** 5 sections. <30s. Git optional.

##### 6.2 — Existing app mode init

**Files:** `services/project_service.py`, `api/state.py`

**Success:** Audit on init. Mode change re-audits.

##### 6.3 — Context bundle integration

**Files:** `adapters/opencode/command_builder.py`, `services/context_service.py`

**Success:** Audit context in existing_app only. Follows contract rules.

---

### Phase 7 — Polish and Defaults: CLI, Recovery UI, Safety, and Documentation

**Estimated complexity:** Medium  
**Dependencies:** All prior phases  
**Deliverable:** `flowbench` CLI, interrupted-run recovery UI, blocked state explanations, safety enforcement, golden-path tests, all docs.

**What changed from v2:** Added recovery UI, golden-path tests, safety constraint enforcement. CLI got `status` command. Install script verifies prerequisites only. More sub-tasks (11 vs 8).

#### Success Criteria

- `flowbench start` and `flowbench status` work
- Interrupted runs detected with recovery prompt
- Blocked states explain and offer recovery
- Structured errors everywhere
- Safety constraints enforced
- 6 golden-path tests pass
- README: 5 steps for non-technical user

#### Sub-Tasks

##### 7.1 — Single `flowbench` CLI

**Files:** `services/cli.py`, `pyproject.toml`

**Success:** `start`, `status`, `help`. Minimal deps.

##### 7.2 — Interrupted-run recovery UI

**Files:** `components/recovery-banner.tsx`, `hooks/use-run-state.ts`

**Success:** Recovery prompt on startup. Four options. No auto-rerun.

##### 7.3 — Blocked state UI

**Files:** `components/blocked-state.tsx`

**Success:** Explanation + recovery actions. Always at least one option.

##### 7.4 — Structured error responses

**Files:** `api/error_handlers.py`, `schemas/errors.py`

**Success:** message + suggested_action everywhere. No tracebacks.

##### 7.5 — Settings screen complete

**Files:** `components/settings-screen.tsx`, `components/new-project-flow.tsx`

**Success:** Health indicator. New project flow.

##### 7.6 — Safety constraints enforcement

**Files:** `main.py`, `store/file_store.py`, `api/middleware.py`

**Success:** 127.0.0.1. Path validation. Artifact boundary. HTML escaping. Template version in RunRecord.

##### 7.7 — Golden-path acceptance tests

**Files:** `tests/test_golden_paths.py`, `scripts/smoke-test.sh`

**Success:** 5 tests pass with mocked adapter. Smoke test for release.

##### 7.8 — README

**Files:** `README.md`

**Success:** 5 steps. Non-technical. First project walkthrough.

##### 7.9 — AGENTS.md

**Files:** `AGENTS.md`

**Success:** OpenCode format. Conventions documented.

##### 7.10 — CONTRIBUTING.md

**Files:** `CONTRIBUTING.md`

**Success:** Adapter guide with worked example.

##### 7.11 — Prerequisite verification script

**Files:** `scripts/install.sh`

**Success:** Clear pass/fail. Install commands. No system modification.

---

## Golden-Path Acceptance Tests

| Test | What it covers | Mocked? |
|------|---------------|---------|
| **New build golden path** | Full lifecycle: init → scope → plan → sharpen → accept → phase plan → build (with `confirmed:true`) → review → test → handoff → complete. Includes simulated restart. | Yes |
| **Existing app golden path** | Init with temp repo → audit → scope → plan → one full phase. | Yes |
| **Interrupted run recovery** | Mid-run crash → restart → interrupted detection → recovery prompt (no auto-rerun). | Yes |
| **Approval gate** | API-level: unconfirmed risky → `confirmation_required`, confirmed → dispatch, non-risky → direct. UI-level: dialog appears, approve/reject paths. Backend safety authority verified. | Yes |
| **Invalid transition** | Invalid action for current state → 400 with explanation → state unchanged. | Yes |
| **Adapter unavailable in Phase 1** | Adapter-backed action → `adapter_not_available` response → state unchanged. | Yes |

Plus one manual **smoke test** (`scripts/smoke-test.sh`) that runs a real OpenCode command against a temp directory to validate end-to-end adapter connectivity before release.

---

## Phase Dependency Graph

```
Phase 1 ────────────────────────────────────────────────────────────────────┐
   │                                                                         │
   ├── Phase 2 ────┐                                                         │
   │                ├── Phase 4 ────┐                                         │
   │                │               │                                         │
   ├── Phase 3 ────┘               ├── Phase 5 ────┐                         │
   │                               │               │                         │
   │                               │               ├── Phase 7 ──────────┐   │
   │                               │               │                    │   │
   │                               └── Phase 6 ────┘                    │   │
   │                                                                     │   │
   └─────────────────────────────────────────────────────────────────────┘   │
                                                                              │
┌─────────────────────────────────────────────────────────────────────────────┘
│
▼
Project Complete
```

- Phase 1 must complete first (everything depends on it)
- Phases 2 and 3 can run in parallel after Phase 1
- Phases 4 and 5 depend on both Phases 2 and 3
- Phase 6 depends on Phases 1 and 3
- Phase 7 depends on all prior phases
