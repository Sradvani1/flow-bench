# Phase 1 Plan Review Memo for OpenCode

## Goal
Sharpen the Phase 1 implementation plan until it is build-safe, regression-aware, and fully aligned with the agreed FlowBench scope. The current plan is strong and unusually complete. It is detailed enough to start implementation, but it still needs a final tightening pass before build so Phase 1 does not quietly absorb Phase 2 behavior, user-facing assumptions, or future adapter complexity.

## What to keep
- Keep the narrow **Phase 1 boundary**: read-oriented FastAPI service, pure state machines, versioned schemas, atomic file store, run persistence, event log, config validation, and tests.
- Keep the explicit statement that **Phase 1 does not execute adapters**. That is the single most important scope protection in the plan.
- Keep the **pure state machine** design with zero I/O in transition logic. That preserves testability, portability, and future adapter flexibility.
- Keep the **flat `.flowbench/` layout**. It supports the product goal of local inspectability and keeps the mental model simple for hobbyists.
- Keep the **adapter_not_available contract** for adapter-backed actions in Phase 1. It is a good placeholder that preserves the workflow surface without pretending the system can do work it cannot yet do.
- Keep the **atomic write discipline** and path escape protection. This is foundational and should not be relaxed later for convenience.
- Keep the **single-active-run rule** and startup interrupt detection. That is the correct default for a process-first builder tool.
- Keep the detailed test intent across schemas, engine, store, API, and contract validation.

## What to change

### 1. Reduce Phase 1 implementation risk by splitting “complete” from “fully wired”
The plan is complete in design, but likely too broad for a first implementation pass if all 47 files are treated as equally first-class. Reframe the work as:
- Core implementation files that must be production-ready in Phase 1.
- Skeleton files that can exist but remain intentionally thin.
- Config and test files that prove the contract.

OpenCode should clearly mark which files are expected to contain full behavior versus minimal placeholders. Right now the plan lists them, but the implementation risk is that the builder may overbuild low-value files early and lose momentum.

### 2. Tighten the distinction between project-level and phase-level ownership
The plan defines both project and phase machines well, but there is still room for implementation confusion about where coordination lives. Add one explicit rule:
- Project machine owns overall lifecycle, queue progression, and project completion.
- Phase machine owns work within the active phase only.
- API layer may coordinate the two, but no machine should implicitly mutate the other.

This needs to be stated in plain English in the implementation plan because it is an easy place for hidden coupling to creep in.

### 3. Clarify the exact behavior of navigation actions
The plan says navigation actions validate action existence and return 200 with same state and no transition. That is good, but it should go further and specify:
- Whether navigation actions log events.
- Whether navigation actions update `updated_at` in `current-state.json`.
- Whether navigation actions appear in run history.

Recommended rule: navigation actions should not create RunRecords, should not mutate state, and should not write event log entries unless the product explicitly wants an audit trail for non-mutating user navigation. Simpler default: no event log entry.

### 4. Make `updated_at` semantics explicit everywhere
The plan references `updatedat` but does not fully specify when it changes. Add one simple contract:
- `updated_at` changes only when persisted project state materially changes.
- Read endpoints do not change it.
- Adapter-backed placeholder calls that return `adapter_not_available` do not change it.
- Navigation actions do not change it.

Without this rule, the field will become noisy and less useful for recovery and debugging.

### 5. Tighten file naming and ID normalization rules
The flat `.flowbench/` layout is a strength, but it depends on deterministic names. Add exact normalization rules for:
- `phaseid` formatting (`phase001`, `phase_001`, or both?).
- Decision artifact IDs.
- Run IDs.
- Allowed characters in filenames derived from workflow values.

Right now the examples mix `phase001` and `phase_003`-style naming concepts. Pick one format and make it universal. Do not leave this to implementation judgment.

### 6. Specify whether event log order is authoritative or merely informational
The write order is sensible, but the plan should explicitly answer: if `current-state.json` and `events.ndjson` disagree after a crash or partial failure, which source wins? Recommended rule:
- `current-state.json` is the authoritative current snapshot.
- `events.ndjson` is an append-only audit trail for debugging and history, not the source of truth for recovery.

This should be stated directly to avoid accidental event-sourcing behavior.

### 7. Simplify the initial API framing
The plan calls Phase 1 “read-oriented,” but it also includes system actions that mutate state. That wording is slightly misleading. Rename the Phase 1 API posture to something like:
- “state-and-contract service” or
- “light orchestration service with local state mutation and no adapter execution.”

That better matches what the implementation actually does.

### 8. Be stricter about Phase 1 approval behavior
The plan references `ApprovalRecord`, but Phase 1 does not yet execute risky adapter actions. That creates ambiguity about whether approvals are active or merely schema-level groundwork. Clarify this explicitly:
- Phase 1 includes approval schemas and storage groundwork only.
- Phase 1 does not yet run a full approval workflow for adapter-backed actions.
- If any system action can be destructive in Phase 1, list it and define whether approval is required now or deferred.

Otherwise OpenCode may build a partial approval UX/API prematurely.

### 9. Clarify whether `archiveproject` is a logical state action or a file operation
The name suggests filesystem consequences, but the state table treats it as a project-complete self-transition. That mismatch should be removed. Choose one:
- Keep `archiveproject` as a non-destructive logical action in Phase 1 and rename it to something like `archiveprojectrecord` or `resetfornewproject`, or
- Define exact file effects, which would likely exceed current scope.

Right now the name invites accidental scope creep.

### 10. Separate “pause” from “blocked” more explicitly
The phase machine maps `pause` to `phaseblocked`. That is workable, but the product language matters. “Paused by the builder” and “blocked by failure” are not the same thing in a user’s mind. Consider either:
- Keeping the internal state as `phaseblocked` but requiring a user-facing label distinction, or
- Introducing a separate paused state later, while explicitly deferring it in Phase 1.

At minimum, document the user-facing language so the API and UI do not later expose confusing state names.

## What is missing

### 1. A short “non-goals” section inside each sub-task
The overall Phase 1 non-goals are implied, but each sub-task should include one or two lines stating what must not be added there. Example:
- State machine task: no adapter calls, no persistence.
- File store task: no business logic, no state validation.
- API task: no orchestration branching beyond contract enforcement.

This will help OpenCode resist accidental architecture spread.

### 2. A product-language map for internal vs user-facing terms
Because FlowBench is for curious hobbyists, the implementation plan should carry a vocabulary map. Example:
- `phasehandoff` -> “handoff ready”
- `phasereadytobuild` -> “ready to build”
- `projectblocked` -> “needs attention”
- `StateTransitionError` message -> plain-English action guidance

This matters even in backend work because API responses and logs will otherwise inherit engineering language by default.

### 3. A definition of recovery behavior after interruption
The startup interrupt detection is good, but the follow-up behavior is still underspecified. Add exact answers to:
- Does startup interruption only mark runs, or also emit an event?
- Does it change current project/phase state?
- What should the next valid user action be after interruption?
- Is “retry last action” available in Phase 1, or only a future concept carried in `recoverymessage`?

Recommended Phase 1 rule: mark runs as interrupted, do not mutate current state automatically, do not fabricate resumability, and present plain-English recovery guidance only.

### 4. Contract validation rules across config files need a sharper checklist
The plan says configs are cross-validated. Good. Now make the validation set explicit. At minimum validate that:
- Every action in `actions.json` exists in at least one workflow state or is intentionally unused.
- Every workflow action has a label/description/action type in `actions.json`.
- Every guard referenced in `workflows.json` exists in code.
- Every adapter method named in config is declared in the adapter config.
- Every risk category referenced in actions exists in policies.
- Every state referenced as a target exists.
- No duplicate action names with conflicting metadata exist.

This deserves a concrete validation matrix, not just a statement of intent.

### 5. API idempotency expectations
Some actions are naturally repeatable and some are not. The plan should explicitly call out expected behavior when the same request is sent twice. Examples:
- `startnewproject` called twice.
- `accepthandoff` called twice.
- `editscope` with identical content.

OpenCode should know whether to return no-op success, transition error, or duplicate-safe response.

### 6. Test coverage for contract drift
The current test plan is good, but add a dedicated emphasis on drift detection:
- Snapshot or fixture-based checks that action names, risk categories, and state references remain aligned across config files.
- Tests that fail loudly if a new action is added to config without being reachable or described.

This project will evolve through prompt-driven edits. Drift tests are especially important.

### 7. A boundary for existing-app mode in Phase 1
The plan mentions `audit.json` for existing-app mode. That is fine, but the implementation needs a very explicit boundary. Add:
- Whether Phase 1 performs real repository inspection or only stores a provided audit artifact.
- Whether “load existing project” requires actual filesystem scanning.
- Whether existing-app mode is functionally equal to new-build mode after initialization.

If real repo audit is not part of Phase 1, say so directly.

### 8. Plain-English error contract examples for more than invalid transition
The plan gives one invalid transition error example. Add examples for:
- Missing current state file.
- Corrupt JSON artifact.
- Config validation failure at startup.
- Attempted path escape.
- Missing run ID.

This will improve consistency and keep the product voice aligned from the start.

## Constraints to respect
- Do not expand Phase 1 into adapter execution, shell command dispatch, prompt assembly, approval workflows, or UI behavior beyond what is needed to support the API contract.
- Do not add databases, queues, background workers, websockets, auth, or multi-user concepts.
- Do not replace the flat `.flowbench/` layout with a more abstract storage model.
- Do not introduce hidden coupling between project and phase machines.
- Do not let placeholder Phase 1 types imply fake functionality. If an action is unavailable, say so plainly and keep behavior minimal.
- Do not optimize for framework cleverness. Optimize for inspectability, predictability, and local-file recoverability.
- Preserve plain-English responses and product language suitable for non-engineer hobbyists.
- Preserve current behavior unless a change is required to resolve ambiguity or protect the agreed scope.

## Definition of done
OpenCode should consider the Phase 1 plan sharpened only when all of the following are true:
- Every file in scope is marked as either full implementation, thin skeleton, config, or test.
- Naming and ID normalization rules are explicit and consistent.
- Source-of-truth rules between snapshot state, run records, and event log are written down.
- Recovery behavior after interrupted runs is fully specified.
- Navigation action semantics are fully specified.
- `updated_at` behavior is fully specified.
- Approval behavior is explicitly deferred or scoped for Phase 1.
- Existing-app mode boundaries are explicit.
- Config cross-validation rules are listed concretely.
- Error contract examples cover the main failure classes.
- No new capabilities are added beyond agreed Phase 1 scope.

## Next step
Do one more sharpening pass on the implementation plan before writing code. The output should be a revised Phase 1 plan, not implementation. That revision should:
1. Add the missing behavioral clarifications listed above.
2. Mark each file by implementation depth.
3. Tighten terminology to match user-facing product language.
4. Explicitly restate Phase 1 non-goals in the sections where scope creep is most likely.
5. Confirm that the final plan is safe for OpenCode to implement without inventing behavior.

Once that sharpening pass is complete, the next valid step is **build** for Phase 1. Do not start building before the revised plan resolves the ambiguities above.
