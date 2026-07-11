# FlowBench Master Plan Review Feedback for OpenCode

## Goal

Sharpen the current master plan one more time before Phase 1 begins. The plan is already strong on scope discipline, architecture direction, and phase sequencing, but it still has several contract-level ambiguities that should be resolved now rather than during implementation.

The core objective of this feedback is to prevent downstream rework in Phase 3, Phase 5, and Phase 7 by tightening the state model, approval model, recovery behavior, and workflow/action definitions before the first foundation code is written.

## Overall assessment

The plan is directionally strong and remains aligned with the product spec.

What is already working well:

- The V1 boundary is disciplined: single active project, local-first, OpenCode-first, no multi-project workspace, no generalized autonomous agent platform.
- The pure Python state-machine core is the right foundation for a workflow product that needs determinism and testability.
- JSON artifacts plus append-only NDJSON events are consistent with the product promise of inspectability and persistence.
- HTTP polling instead of WebSockets is the right simplicity tradeoff for local, single-user V1.
- The adapter abstraction is useful, but limiting real execution to OpenCode in V1 is the correct scoping choice.
- The five-section existing-app audit is intentionally shallow in the right way.
- The staged project loop still reflects the intended FlowBench methodology: plan, sharpen, build, review, test, fix, handoff.

However, the plan is not yet build-ready.

The main problem is not missing features. The main problem is that several core workflow behaviors are still underspecified or internally inconsistent. If Phase 1 starts now, OpenCode will be forced to invent contract details while coding the foundation, and later phases will likely need to revise those same contracts.

## What to keep

### 1. Keep the narrow V1 boundary

Do not expand beyond a single active project. Do not add project switching, multi-user concepts, cloud sync, or generalized orchestration features.

This is the right constraint for a hobbyist-facing tool whose promise is clarity, not power-user surface area.

### 2. Keep the pure state-machine core

The state machine should remain pure logic with zero IO. That is one of the best decisions in the plan.

This gives FlowBench a stable core that is easy to test, reason about, and trust.

### 3. Keep file-based persistence

Retain:

- `current-state.json`
- artifact JSON files
- append-only `events.ndjson`

This supports the product promise that the user can see what happened and continue later without hidden state.

### 4. Keep OpenCode as the only real V1 executor

Maintain the adapter interface, but keep V1 execution focused on OpenCode only.

That preserves future extensibility without paying the complexity cost of real multi-adapter support now.

### 5. Keep the shallow existing-app audit

The existing-app audit should stay deliberately limited to:

- framework/language detection
- top-level structure
- entry points and key files
- dependencies
- tests

Do not let this drift into deep static analysis.

## What to change

## 1. Redesign the approval model

This is the most important issue in the current plan.

The current plan appears to assume all of the following at once:

- the adapter runs a command
- the adapter returns risky actions
- FlowBench pauses for approval before execution
- approval then resumes execution

Those ideas do not fit cleanly together.

A command cannot usually be both already executed and still waiting for pre-execution approval. More importantly, OpenCode may decide on specific file edits, installs, deletions, or shell actions while it is actively working. FlowBench cannot honestly claim to pre-approve every concrete future action unless FlowBench is intercepting tool calls in real time, which is explicitly not this product.

### Recommendation for V1

Use **stage-level approval**, not object-level approval.

That means:

- Before running a phase action that may modify the repo, FlowBench warns the user in plain English.
- The warning explains the category of risk, not a fake precise list of future tool calls.
- The builder approves the stage run.
- OpenCode then runs under its own safeguards and confirmation behaviors.

Example wording:

- “Starting this build may change files in your project.”
- “This step may install packages or run local commands.”
- “Review OpenCode confirmations carefully before proceeding.”

This is truthful, understandable, and implementable.

### What to remove or revise

Unless a real pending-execution model is introduced, do not keep the current assumption that:

- the adapter can always surface exact risky actions before execution
- rejecting approval simply means the command never ran
- approving later “resumes” the same exact suspended operation

That resume model requires a durable pending execution object, immutable inputs, and idempotency rules. That is too much complexity for the stated V1.

## 2. Define one authoritative workflow contract

The plan currently spreads workflow behavior across:

- state diagrams
- action labels
- phase descriptions
- success criteria
- UI assumptions

As a result, several promised actions are not yet fully modeled in a single place.

Examples that need explicit treatment:

- pause
- cancel
- retry
- ask for summary
- skip phase
- reorder phase
- revise scope
- re-plan after blockage
- override and continue
- skip tests

### Required change

Before Phase 1 starts, create a single **Workflow Contract** artifact that defines for every state:

- internal state name
- plain-English label
- allowed user actions
- preconditions
- resulting state
- artifact created or updated
- event emitted
- retry behavior
- confirmation requirement
- recovery path

This contract should become the source of truth that validates:

- `workflows.json`
- `actions.json`
- state-machine tests
- API responses
- UI button rendering

Without this, Phase 1 will hardcode assumptions that later phases may invalidate.

## 3. Add interrupted-run and recovery behavior

The plan handles persistence, but it does not yet clearly define run interruption behavior.

These are normal cases, not rare edge cases:

- app closes while OpenCode is running
- timeout occurs
- laptop sleeps or restarts
- model/backend fails mid-run
- user clicks the same action twice
- artifact generation succeeds but final persistence fails

### Required change

Add a persistent `RunRecord` concept now.

Minimum fields:

- `run_id`
- requested action
- phase id if applicable
- started_at
- finished_at
- status: queued, running, succeeded, failed, timed_out, cancelled, interrupted
- input artifact references or hashes
- output artifact path if any
- failure or recovery message

### Recovery rule

On startup, any previously running action should become an interrupted run state that says, in plain English:

- work may have stopped unexpectedly
- some changes may already exist in the repo
- choose one of: inspect results, retry, continue from current artifacts, or revise the plan

Do not auto-rerun interrupted work.

## 4. Define context bundle rules for every adapter action

The plan says existing-app audit context is included in some prompts, and handoff context flows into later work, but it does not yet define a consistent context assembly rule for all adapter-backed actions.

That is risky because context drift is exactly one of the problems this product is meant to solve.

### Required change

Define a **Context Bundle Builder** before Phase 3 implementation.

For each adapter action, explicitly list the required inputs.

Example:

| Action | Required context |
|---|---|
| Generate master plan | Scope, existing-app audit if present |
| Refine master plan | Scope, current master plan, unresolved decisions |
| Generate phase plan | Master plan, selected phase, prior handoff, audit if present |
| Build phase | Approved phase plan, current handoff, relevant constraints |
| Review phase | Phase plan, build summary, current repo state |
| Test phase | Phase plan, build summary, review findings, current repo state |
| Fix findings | Phase plan, review findings, test failures, latest build summary |
| Generate handoff | Current phase artifacts, unresolved issues, next phase context |

This bundle should be versioned and attached to the run record.

## 5. Remove overlap between Phase 2 and Phase 4

The current plan has duplicated responsibility between:

- Phase 2 Console UI
- Phase 4 Artifacts and Timeline

Phase 2 already includes artifact panel behavior, stage-aware mapping, queue rendering, and timeline rendering. Phase 4 then appears to build much of that again in more detail.

### Required change

Choose a cleaner split.

Recommended split:

- **Phase 2**: console shell, header, command pane, settings entry point, placeholder artifact area, basic queue shell, base layout
- **Phase 4**: all artifact-type renderers, auto-selection logic, timeline rendering, history polish, empty-state messaging

This reduces churn and gives each phase a clearer purpose.

## 6. Add local safety boundaries

Local-first does not mean no security or safety design is needed.

FlowBench will still be launching agent runs inside real user-selected directories.

### Add these constraints explicitly

- Bind the backend to `127.0.0.1` only.
- Validate and normalize repo paths before use.
- Resolve symlinks before path approval.
- Do not allow artifact writing outside approved FlowBench state directories.
- Never persist secrets in artifacts, prompts, logs, or UI messages.
- Treat all artifact content as untrusted text when rendering.
- Record command template version and working directory for each run.
- Treat “production” risk categories carefully unless V1 can actually determine environment context reliably.

## What is missing

## 1. Rules for reordering, skipping, and restoring phases

The product scope allows reordering and skipping phases, but the plan does not yet define the operational rules.

### Add explicit rules

- Only upcoming phases can be reordered.
- A phase cannot move ahead of an unmet dependency.
- Skipping requires a plain-English reason.
- Skipped phases remain visible as skipped.
- Skipped phases can be restored to upcoming before project completion.
- Any reorder or skip action creates an event and a small decision artifact.

## 2. A definition of “sharp enough”

The plan uses sharpening language well, but it still needs an acceptance rule for what counts as a sharp master plan or sharp phase plan.

### Add a readiness checklist

A plan is ready for acceptance only when:

- the goal is clear
- non-goals are explicit
- dependencies are known
- acceptance checks are testable
- builder decisions are listed separately
- existing behavior to preserve is stated when relevant
- the next action is obvious
- unresolved blockers are either cleared or called out

This should be a visible standard in the workflow, not an implicit judgment.

## 3. Product-level acceptance tests

Phase 1 has strong unit-test thinking, but the overall plan still needs explicit full-product acceptance coverage.

### Add at least two golden-path test scenarios

#### New build golden path

- initialize project
- save scope
- generate master plan
- sharpen master plan
- generate first phase plan
- build
- review
- test
- handoff
- restart app mid-process
- recover successfully

#### Existing app golden path

- initialize existing app project
- run audit
- confirm audit is included in planning context
- generate plan
- complete one phase with artifact continuity

Mock OpenCode for deterministic automated tests. Keep one manual real-OpenCode smoke test for release readiness.

## Phase 1 feedback

## Goal

Phase 1 should build the durable foundation and nothing more.

It is the right first phase, but it should be tightened before implementation starts.

## What to keep in Phase 1

- repo scaffolding
- Python project initialization
- config validation
- schemas
- pure state machine
- file store
- event log
- API foundation
- unit and API tests

## What to add to Phase 1

### 1. Run persistence

Add:

- `RunRecord` schema
- run store
- interrupted run recovery rules
- single-active-run lock or idempotency guard

### 2. Atomic writes

Persist state and artifacts with safe write behavior:

- write temp file
- fsync if appropriate
- rename into place
- append event only after durable write succeeds

This prevents partial state corruption.

### 3. Schema versioning

Every persisted top-level artifact should carry a version number from the start.

That keeps future migrations possible once the open-source project evolves.

### 4. Workflow contract validation tests

Add tests that verify:

- every configured state has valid actions
- every action has a plain-English label
- every transition has a defined result
- every terminal or blocked path has a recovery or explanatory route

## What to remove from Phase 1 unless clarified first

- Approval API work should wait until the approval model is finalized.
- Any schema that assumes exact pre-execution risky action capture should wait until the approval design is revised.
- UI work in Phase 1 should stay skeletal only.

## Constraints to respect

When revising the plan, keep these boundaries firm:

- Do not turn FlowBench into a chat-first interface.
- Do not turn FlowBench into a runtime agent interception system.
- Do not add cloud, accounts, collaboration, or project switching.
- Do not expose software-engineering jargon in the main user flow.
- Do not let artifacts become raw agent transcripts.
- Do not let OpenCode invent workflow rules during implementation; the workflow contract must come first.

## Definition of done for this sharpening pass

The master plan is ready for Phase 1 only when all of the following are true:

- approval behavior is realistic and internally consistent
- every promised action is represented in one authoritative workflow contract
- interrupted, timed-out, duplicate, failed, cancelled, and restarted runs have explicit behavior
- context bundle rules exist for every adapter-backed action
- Phase 2 and Phase 4 responsibilities are cleanly separated
- reorder, skip, restore, override, and re-plan rules are explicit
- local path and artifact safety constraints are documented
- Phase 1 includes run persistence, atomic writes, schema versions, and workflow-contract validation
- product-level golden-path tests are defined

## Next step

Do one focused **Master Plan Sharpening #2** pass before Phase 1.

That pass should be limited to:

1. approval model
2. workflow contract
3. run persistence and recovery
4. context bundle definition
5. phase boundary cleanup
6. skip, reorder, override, and recovery rules
7. local safety constraints
8. Phase 1 contract changes
9. product-level acceptance tests

After that, regenerate the Phase 1 plan against the revised master plan and begin implementation.
