# FlowBench — Product Scope v2.0

> An open-source workflow console for hobbyist app builders that orchestrates software projects through a structured, repeatable master-plan loop — for new builds and existing running apps alike.

***

## 1. The Problem Worth Solving

### The Hobbyist Builder Gap

There is a growing population of people who have strong ideas, sharp product instincts, and the curiosity to build software — but who are not software engineers and have no desire to become one. AI coding tools have dramatically lowered the barrier to entry, and vibe-coding platforms have proven that non-technical builders can generate working software from natural language. But there is a persistent structural problem: **the available tools are optimized for the first weekend, not the next three months**.[^1]

The dominant commercial platforms share compounding weaknesses:

- **Credit trap pricing.** Every AI interaction burns credits whether it succeeds or not. Fixing one thing often breaks another; the cycle is unpredictable and expensive.[^2][^3][^1]
- **Vendor lock-in.** Code, databases, auth, and hosting live inside one platform. Migrating means rebuilding from scratch. By the time costs escalate, the builder is trapped.[^4][^5]
- **No process ownership.** The builder fires prompts at a black box. There is no repeatable loop, no checkpointing, no meaningful way to guide or correct the trajectory of the work.[^6][^7]
- **No learning.** Because the builder has no structured relationship with what the agent is doing, nothing compounds. Each session starts over.[^8][^6]
- **Context collapse across sessions.** Agent context resets between sessions. Without a structured handoff, each new session starts without an accurate picture of where the last one left off.

Tools like Cursor, OpenCode, and Claude Code solve these problems for professional developers but assume baseline technical competency that the hobbyist builder does not have.[^8]

**The gap is not technical capability — it is process.** Hobbyist builders are missing a structured, repeatable loop that helps them run a build session with confidence, understand what is happening, make intelligent decisions at key moments, and end each session with something that moved forward.[^9]

### The Process That Actually Works

Through direct experience, a reliable pattern for hobbyist app building has emerged:

1. Start from a written scope.
2. Turn the scope into a master plan — a full decomposition of the project.
3. Sharpen the master plan iteratively until there are no ambiguities.
4. Execute the master plan phase by phase, where each phase is scaffolded and bounded.
5. For each phase, run a consistent sub-loop: detailed plan → sharpen → build → review → test → fix → handoff.
6. Repeat until all phases in the master plan are complete.

This loop works for new apps built from nothing and equally for existing running apps that need new features, refactors, or improvements. FlowBench exists to help a non-technical builder operate that loop reliably — without needing to manually track state, re-explain context, or babysit the coding agent through every transition.

***

## 2. Product Definition

### Name

**FlowBench** — a workbench for running software development workflows.

### One-Line Definition

An open-source local workflow console that turns an app scope into a sharpened master plan, decomposes that plan into phases, and walks each phase through a repeatable build loop until the project is complete — for both new builds and existing running apps.

### Product Mantra

**Teach the loop, not the code.**

### What FlowBench Is

FlowBench is a local command console and workflow engine that sits **above** AI coding agents. It is not a coding agent itself. It does not write code, generate prompts autonomously, or manage model routing — those responsibilities belong to the configured execution backend (OpenCode, Pi, or any other agent runtime).

FlowBench's job is to:

1. Ingest a scope and hold the full project context.
2. Orchestrate master plan generation and iterative sharpening.
3. Decompose the sharpened master plan into an ordered phase queue.
4. For each phase, run the phase sub-loop: plan → sharpen → build → review → test → fix → handoff.
5. Persist state, artifacts, and history across sessions so nothing is lost between runs.
6. Enforce approval gates before any risky operation proceeds.
7. Surface the current project and phase state in a plain-English command console.

Think of it as a project operations panel: the builder always knows where they are, what just happened, what the next valid step is, and what any risky action will actually do before it runs.

### What FlowBench Is Not

- Not a code editor or IDE.
- Not an AI model provider or router.
- Not a project hosting service.
- Not an autonomous "fire and forget" agent.
- Not a freeform chatbot or open-ended prompt interface.
- Not a team collaboration tool.
- Not an enterprise orchestration platform.
- Not a replacement for Lovable, Bolt, or Replit for users who want a managed single-click experience.

***

## 3. Target User

### Primary User: The Hobbyist Builder

A curious, non-technical person who uses AI coding tools to build small software projects and wants a reliable, structured process rather than guessing whether today's session will produce something useful. They may be building something from scratch or maintaining and improving an app that is already live.[^10]

| Dimension | Profile |
|---|---|
| Technical background | Limited or none; no formal software training |
| Motivation | Loves building and iterating; the craft is the reward [^11] |
| Project type | Niche personal tools, hobby dashboards, small utilities, personal running apps  |
| Learning stance | Willing to learn a reliable process; does not want to become a programmer [^10] |
| Budget | Cost-sensitive; prefers pay-as-you-go or low fixed overhead [^2] |
| Values | Open source, portability, no vendor lock-in [^4][^5] |
| Audience | Builds for personal use or small organic audiences  |
| Project state | **New builds and existing running apps both in scope** |

### Language

Every label, action, status message, and artifact in FlowBench must be written in plain English. The target user does not know what a state machine, subagent, dispatch event, or execution adapter means.

| Engineering language | FlowBench language |
|---|---|
| Master plan sharpening iteration | "Refining the plan" |
| Phase handoff artifact | "Ready for the next phase" |
| State: `awaiting_approval` | "Waiting for your decision" |
| Action: `spawn_subagent` | "Start work" |
| Action: `approve_risky_action` | "Yes, go ahead" |
| State: `phase_blocked` | "Phase is stuck — needs your input" |
| Action: `replan_phase` | "Change this phase's plan" |
| Artifact: `review_findings` | "What the review found" |
| Artifact: `phase_handoff` | "Handoff notes for the next phase" |
| Action: `sharpen_master_plan` | "Refine the plan" |

### Anti-User

FlowBench is deliberately not designed for:

- Professional software engineers who want maximum toolchain flexibility or custom agent pipelines.
- Teams building multi-user production applications with compliance or enterprise ops requirements.
- Builders whose projects have outgrown hobby scale and need CI/CD, cloud infrastructure management, or distributed systems architecture.
- Users who want a fully autonomous experience with no involvement or judgment required.

### Graduation Criteria

FlowBench is the right tool for a project until any of the following become true:

- The project needs more than one active developer.
- The project handles regulated, financial, or health data in production.
- The project requires custom cloud infrastructure or complex deployment pipelines.
- The builder wants to go deep into learning software engineering as a discipline.

When a project graduates, FlowBench should help the builder understand why and what to consider next — not trap them.

***

## 4. Core Principles

These principles govern every product decision. When a proposed feature conflicts with a principle, the principle wins.

### 1. Open Source and Portable
MIT-licensed, free to run locally, no FlowBench account, no cloud dependency. The builder owns their scope, master plan, phase history, and artifacts as plain files on their own machine.

### 2. No Vendor Lock-In by Design
Decoupled from any specific coding runtime, model provider, or hosting platform. OpenCode is adapter one. Pi, Claude Code, or plain shell execution may follow. If a provider raises prices or a runtime project is abandoned, the builder changes one config line — not their entire workflow.

### 3. Process Before Autonomy
The goal is maximum understanding, not maximum automation. The builder always knows what stage their project is at, what just happened, and what will happen next before any action proceeds. Automation serves the process; the process never disappears into automation.

### 4. Predefined Actions, Not Open Chat
The builder advances work by selecting from a small set of stage-aware predefined actions — not by typing freeform instructions. The interface is a control panel, not a conversation. An optional short note can accompany any action as supplementary context.

### 5. Explicit Approval for Risky Actions
Any operation that could cause irreversible or consequential change must pause and require explicit builder approval with a plain-English explanation of what will happen and why it is flagged. Silent progression past a risky action is never acceptable.

### 6. Session-Persistent Context
Agent context resets between sessions. FlowBench does not. All project state, the master plan, phase queue, and phase artifacts survive indefinitely across sessions. A builder who picks up a project after two weeks always has full context about where it was left off.

### 7. Works on Existing Apps, Not Just New Ones
A builder should be able to point FlowBench at an existing running app, define a scope for the next improvement or refactor, and run the same master-plan-and-phase loop they would use for a new build. The tool makes no assumption that the repo is empty or freshly created.

### 8. Small Projects First, Forever
FlowBench will resist scope creep toward multi-repo management, team workflows, enterprise integrations, or large-scale cloud orchestration. Staying small-project-first is what keeps the product understandable to a non-technical user.

### 9. Plain Files, Inspectable State
All project state, master plans, phase queues, phase histories, approvals, and artifacts are stored as human-readable JSON and NDJSON files. The builder or an advanced user can always open any file and see exactly what the system knows.

***

## 5. The Workflow Model

This is the heart of FlowBench. Everything in the product is designed to support this specific loop.

### Level 1: Project Loop

```
Scope Intake
    ↓
Master Plan Drafting      ← coding agent generates from scope
    ↓
Master Plan Sharpening    ← iterate until no ambiguities remain
    ↓
Phase Queue Ready         ← master plan decomposed into ordered phases
    ↓
Phase In Progress         ← one phase runs at a time
    ↓  (repeat until all phases complete)
Project Complete
```

### Level 2: Phase Sub-Loop

Each phase in the queue runs through the same bounded cycle:

```
Phase Plan         ← detailed plan for this phase only
    ↓
Phase Sharpen      ← iterate until phase plan is unambiguous
    ↓
Phase Build        ← coding agent executes the phase
    ↓
Phase Review       ← review what was built vs. what was planned
    ↓
Phase Test         ← test for correctness and regressions
    ↓
Phase Fix          ← address findings; may loop back to review/test
    ↓
Phase Handoff      ← write handoff notes; mark phase complete
    ↓
Next Phase (or Project Complete)
```

### Sharpening Logic

"Sharpening" is an explicit iterative step that occurs at two levels:

- **Master plan sharpening**: After the initial master plan is generated from the scope, the builder triggers a sharpening action. The coding agent reviews the plan for ambiguities, missing context, or unresolvable dependencies, and the builder makes decisions. This repeats until the master plan is marked sharp.
- **Phase plan sharpening**: Each phase begins with a detailed plan for that phase only. Before building starts, a sharpening iteration resolves any remaining ambiguities specific to that phase. A phase can only transition to build when its plan is marked sharp.

Sharpening ensures that the coding agent always has a clear, unambiguous brief before executing work. This dramatically reduces fix-break-fix cycles.[^7][^12]

### Handoff as First-Class Concept

At the end of every phase, FlowBench generates a **handoff artifact**. This captures:

- What was built.
- What was tested and how.
- Known issues left for future phases.
- Context the next phase needs to start cleanly.
- Any decisions made during this phase that affect future phases.

The handoff artifact is surfaced to the coding agent at the start of the next phase. This solves the context-collapse problem: agent sessions reset, but FlowBench ensures the project context never does.

### Existing App Mode

When a builder points FlowBench at an existing repo, the workflow is the same — but the scope intake step includes an optional **app audit**: a read-only review of the current codebase to generate a baseline understanding. This gives the master plan the context it needs to avoid breaking what already works.

The same master-plan-and-phase-loop then runs for the improvement or refactor, with all existing behavior protected by the test and review gates.

***

## 6. User Experience

### Interface Philosophy

FlowBench is a **command console**, not a chatbot. The primary screen is a three-pane layout:

1. **Project header** — app name, current mode (new build or existing app), current level (project or phase), current stage, last updated timestamp.
2. **Command pane** — the stage-aware set of predefined actions available right now, in plain English.
3. **Current artifact** — the most recent plan, sharpening notes, build summary, review findings, test results, or handoff notes.

Secondary screens:
- **Project timeline** — readable history of every transition and decision at both the project and phase level.
- **Phase queue** — list of all phases with status: upcoming, in progress, complete, or blocked.
- **Approval queue** — any pending risky action decisions, shown one at a time with full context.
- **Settings** — repo path, execution backend, policy options.

### Project-Level Actions (Command Pane)

| Stage | Available actions |
|---|---|
| Starting | Load existing app, Start new project, Change backend |
| Scope ready | Generate master plan, Edit scope, Cancel |
| Master plan drafted | Refine the plan, Accept the plan, Cancel |
| Phase queue ready | Start next phase, View all phases, Re-order phases |
| Project blocked | Explain what is wrong, Re-plan from here, Cancel |
| Project complete | View summary, Archive project, Start a new project |

### Phase-Level Actions (Command Pane)

| Phase stage | Available actions |
|---|---|
| Phase starting | Generate phase plan, Skip this phase, Cancel |
| Phase plan drafted | Sharpen this plan, Accept phase plan, Cancel |
| Phase ready to build | Start building, Change phase plan, Cancel |
| Phase building | Pause, Ask for a summary, Cancel |
| Waiting for decision | Approve this action, Reject this action, Explain why this is flagged |
| Phase reviewing | Accept review, Fix findings, Override and continue |
| Phase testing | Accept test results, Fix failures, Skip tests |
| Phase fixing | Start fixing, Pause, Cancel |
| Phase handoff | Generate handoff notes, Accept handoff, Mark phase complete |
| Phase complete | Start next phase, View handoff notes |

### Approval Experience

When the execution backend proposes a risky operation, the console stops entirely. The approval screen shows:

- **What is being asked** — plain-English description of the proposed action.
- **Why it is flagged** — which policy rule was triggered.
- **What happens if you approve** — specific, concrete consequences.
- **What happens if you reject** — the work pauses and waits for a new direction.

The builder selects "Yes, go ahead" or "No, don't do this." No gray area, no silent continuation, no timeout that auto-approves.

### Artifacts

Every major stage transition produces a human-readable artifact stored to disk and rendered in the UI:

| Artifact | Plain-English label | Content |
|---|---|---|
| Scope | "Your app idea" | The original scope text |
| Master plan | "The full project plan" | All phases, goals, dependencies |
| Sharpening notes | "Questions and decisions" | Ambiguities surfaced and resolved |
| Phase plan | "What this phase will do" | Bounded plan for the current phase only |
| Build summary | "What was built" | Files touched, changes made |
| Review findings | "What the review found" | Issues, confirmations, edge cases |
| Test results | "How the tests went" | Pass/fail, failures described plainly |
| Phase handoff | "Ready for the next phase" | Context for the next agent session |
| Event log | "Project history" | Timestamped record of all transitions |

***

## 7. Project Modes

FlowBench supports two project modes from day one.

### New Build Mode

The builder starts with a scope document — a written description of what they want to build. FlowBench uses this as the foundation for the master plan. No existing code is assumed. The coding agent scaffolds the project from scratch, and FlowBench manages each phase of the build until the app is complete.

### Existing App Mode

The builder points FlowBench at a repo that already contains a running app. FlowBench first runs an optional **app audit** — a read-only scan of the codebase to produce a plain-English description of what currently exists, how it is structured, and what constraints should be respected. This audit becomes part of the master plan context.

The builder then writes a scope for the improvement, feature, or refactor they want to make. The master plan and phase loop proceed exactly as in New Build Mode, but with the app audit as a baseline constraint. The test and review gates are especially important in this mode to protect existing behavior.

***

## 8. Technical Architecture

### Overview

FlowBench is a lightweight local application with three layers:

1. **Next.js front end** — the command console UI, served locally.
2. **Python/FastAPI backend** — the two-level state machine, policy engine, and execution adapter interface.
3. **JSON/NDJSON file store** — all persisted state, artifacts, and history on the local filesystem.

The execution backend is invoked through an **adapter interface**. The adapter translates a FlowBench stage action into the appropriate backend-specific command, executes it in the project directory, captures the output, and returns a normalized result. FlowBench's orchestration logic never calls the execution backend directly — only through the adapter.

### Monorepo Structure

```
flowbench/
  apps/
    web/                          # Next.js UI
  services/
    orchestrator/                 # FastAPI state machine, adapter layer
  config/
    project-modes.json
    workflows.json                # State/transition definitions
    actions.json                  # Action catalog and stage mappings
    policies.json                 # Approval-required operation categories
    adapters/
      opencode.json
  projects/
    {project-id}/
      scope.md
      master-plan.json
      sharpening-notes.json
      phase-queue.json
      phases/
        {phase-id}/
          phase-plan.json
          sharpening-notes.json
          build-summary.json
          review-findings.json
          test-results.json
          handoff.json
      events.ndjson
      approvals.json
      current-state.json
  adapters/
    opencode/
      commands/
        audit-existing-app.md
        generate-master-plan.md
        sharpen-plan.md
        generate-phase-plan.md
        sharpen-phase-plan.md
        build-phase.md
        review-phase.md
        test-phase.md
        fix-findings.md
        generate-handoff.md
        summarize-state.md
  docs/
  README.md
  LICENSE
```

### Two-Level State Machine

#### Project State Machine

```
scope_ready
  → master_plan_drafting       (action: generate_master_plan)

master_plan_drafting
  → master_plan_sharpening     (event: draft_complete)
  → project_blocked

master_plan_sharpening
  → master_plan_sharpening     (action: sharpen_again)
  → phase_queue_ready          (action: accept_master_plan)

phase_queue_ready
  → phase_in_progress          (action: start_next_phase)
  → project_complete           (event: all_phases_complete)

phase_in_progress
  → phase_handoff              (event: phase_loop_complete)
  → project_blocked            (event: phase_blocked)

phase_handoff
  → phase_queue_ready          (event: handoff_accepted)

project_blocked
  → master_plan_sharpening     (action: replan_from_here)
  → scope_ready                (action: revise_scope)

project_complete               (terminal)
```

#### Phase State Machine

```
phase_plan
  → phase_sharpening           (event: phase_draft_complete)

phase_sharpening
  → phase_sharpening           (action: sharpen_again)
  → phase_ready_to_build       (action: accept_phase_plan)

phase_ready_to_build
  → phase_building             (action: start_building)

phase_building
  → phase_awaiting_approval    (event: risky_action_proposed)
  → phase_reviewing            (event: build_complete)
  → phase_blocked

phase_awaiting_approval
  → phase_building             (action: approve)
  → phase_blocked              (action: reject)

phase_reviewing
  → phase_testing              (event: review_accepted)
  → phase_fixing               (event: problems_found)

phase_testing
  → phase_handoff              (event: tests_passed)
  → phase_fixing               (event: tests_failed)

phase_fixing
  → phase_reviewing            (event: fix_complete)
  → phase_blocked

phase_handoff
  → phase_complete             (action: accept_handoff)

phase_complete                 (terminal → returns to project state machine)
phase_blocked                  (terminal → surfaces to project state machine)
```

### Adapter Interface

```python
class ExecutionAdapter:
    def audit_existing_app(self, repo_path: str) -> AdapterResult: ...
    def generate_master_plan(self, scope: str, audit: str | None) -> AdapterResult: ...
    def sharpen_plan(self, plan: str, level: str) -> AdapterResult: ...
    def generate_phase_plan(self, phase: Phase, handoff: str | None) -> AdapterResult: ...
    def build_phase(self, phase_plan: str, context: ProjectContext) -> AdapterResult: ...
    def review_phase(self, context: ProjectContext) -> AdapterResult: ...
    def test_phase(self, context: ProjectContext) -> AdapterResult: ...
    def fix_findings(self, findings: str, context: ProjectContext) -> AdapterResult: ...
    def generate_handoff(self, context: ProjectContext) -> AdapterResult: ...
    def summarize_state(self, context: ProjectContext) -> AdapterResult: ...
    def health_check(self) -> bool: ...
```

`AdapterResult` carries: `success`, `output_text`, `proposed_risky_actions`, `artifact_path`, `suggested_next_action`.

### JSON File Contracts

**`current-state.json`**
```json
{
  "project_id": "proj_flowbench_20260710",
  "project_name": "FlowBench",
  "repo_path": "/Users/you/projects/flowbench",
  "mode": "new_build",
  "project_state": "phase_in_progress",
  "current_phase_id": "phase_003",
  "current_phase_state": "phase_reviewing",
  "total_phases": 6,
  "phases_complete": 2,
  "adapter": "opencode",
  "updated_at": "2026-07-10T13:00:00Z"
}
```

**`phase-queue.json`**
```json
[
  { "phase_id": "phase_001", "name": "Foundation", "status": "complete" },
  { "phase_id": "phase_002", "name": "Console UI", "status": "complete" },
  { "phase_id": "phase_003", "name": "OpenCode Adapter", "status": "in_progress" },
  { "phase_id": "phase_004", "name": "Artifacts and Timeline", "status": "upcoming" },
  { "phase_id": "phase_005", "name": "Approval System", "status": "upcoming" },
  { "phase_id": "phase_006", "name": "Polish and Defaults", "status": "upcoming" }
]
```

**`handoff.json`**
```json
{
  "phase_id": "phase_002",
  "phase_name": "Console UI",
  "what_was_built": "Next.js command console with run header, command pane, and artifact tabs. Dark mode included.",
  "what_was_tested": "Stage transitions, action visibility rules, artifact rendering.",
  "known_issues": ["Timeline tab rendering is placeholder pending artifact system"],
  "decisions_made": ["Used shadcn/ui for component primitives", "TanStack Query for polling"],
  "context_for_next_phase": "Phase 3 should implement the adapter interface and wire OpenCode commands to command pane actions. The AdapterResult shape is defined in services/orchestrator/schemas/adapter.py.",
  "completed_at": "2026-07-10T12:00:00Z"
}
```

### Policy Engine

V1 approval-required categories:

- Destructive shell operations (file deletion, directory removal)
- Secrets or environment variable changes
- Dependency installation or lockfile modification
- Git commit, push, or PR creation
- Cloud configuration changes
- Production service restarts
- Production database commands

***

## 9. Execution Adapters

### V1: OpenCode Adapter

OpenCode is the first supported execution backend. It is open source, model-neutral, supports 75+ providers, and has zero vendor lock-in. Its custom command system supports arguments, file references, agent-level model selection, and subtask execution, making it a well-matched substrate for FlowBench's predefined action model.[^13][^14][^15]

OpenCode adapter command templates:

| Template | FlowBench action |
|---|---|
| `audit-existing-app.md` | App audit (existing mode) |
| `generate-master-plan.md` | Generate master plan |
| `sharpen-plan.md` | Sharpen master plan or phase plan |
| `generate-phase-plan.md` | Generate phase plan |
| `build-phase.md` | Build phase |
| `review-phase.md` | Review phase |
| `test-phase.md` | Test phase |
| `fix-findings.md` | Fix review or test findings |
| `generate-handoff.md` | Generate phase handoff |
| `summarize-state.md` | Summarize current state |

Each template is a standard OpenCode markdown command file. FlowBench injects the current scope, plan, phase plan, and handoff context as arguments before execution.[^13]

### Future Adapters

The adapter interface is designed so Pi, Claude Code, a plain shell adapter, or any future runtime can be added without changing the workflow engine or the UI. Each adapter implements the same interface and returns a normalized `AdapterResult`. The user switches adapters with one config change.

***

## 10. V1 Feature Scope

### Included in V1

| Feature | Description |
|---|---|
| New build mode | Scope → master plan → phases → complete |
| Existing app mode | App audit → scope → master plan → phases → complete |
| Two-level state machine | Project state + phase state, fully governed |
| Master plan generation | Coding agent generates plan from scope |
| Master plan sharpening | Iterative clarification until unambiguous |
| Phase queue | Ordered list of phases with status |
| Phase sub-loop | Plan → sharpen → build → review → test → fix → handoff |
| Phase sharpening | Per-phase clarification before build starts |
| Handoff artifacts | Structured context for next agent session |
| Command pane | Stage-aware predefined actions in plain English |
| OpenCode adapter | Full integration via OpenCode CLI commands |
| Approval queue | Policy-gated approvals with plain-English explanations |
| Artifacts panel | All artifact types rendered as readable summaries |
| Project timeline | Full event history across project and phase levels |
| JSON/NDJSON file store | All state as local files, no database |
| Settings screen | Repo path, project mode, adapter selection, policies |
| Light and dark mode | Standard UI accessibility |
| Session-persistent context | All state survives indefinitely across sessions |
| Local only | No accounts, no cloud, no telemetry |

### Explicitly Excluded from V1

| Feature | Why excluded |
|---|---|
| Multi-repo portfolio management | Out of small-project-first scope |
| Multiple simultaneous projects | Adds complexity without clear V1 need |
| Team or multi-user workflows | Not the target user |
| GitHub issue/PR integration | V2 candidate |
| Free-form chat interface | Contradicts command-pane UX philosophy |
| Built-in model routing | Belongs to the execution adapter |
| Code viewer or diff renderer | V2 candidate |
| Analytics and usage dashboards | V2 candidate |
| Plugin or extension system | V2 candidate |
| Mobile interface | V2 candidate |

***

## 11. Build Phases

FlowBench is itself built using the same master-plan-and-phase loop it orchestrates.

| Phase | Deliverable | Success criteria |
|---|---|---|
| **1 — Foundation** | Two-level state machine, Pydantic schemas, FastAPI service, JSON/NDJSON event log | Both state machines govern transitions correctly; events persist across restarts |
| **2 — Console UI** | Next.js app: project header, phase queue view, command pane, artifact tabs | Builder can see project state, phase queue, and stage-valid actions |
| **3 — OpenCode Adapter** | Adapter interface + OpenCode implementation + all command templates | All adapter methods execute real OpenCode commands; normalized results captured |
| **4 — Artifacts and Timeline** | Artifacts panel: scope, master plan, sharpening notes, phase plan, build summary, review findings, test results, handoff; project timeline | Builder can read every artifact type in plain English; full event timeline visible |
| **5 — Approval System** | Policy engine, approval records, approval UI with plain-English prompts | Risky actions stop the run; builder approves or rejects with full context |
| **6 — Existing App Mode** | App audit command, audit artifact, existing-app context injection into master plan | Builder can point FlowBench at an existing repo and complete a full project loop |
| **7 — Polish and Defaults** | Error and blocked states, settings screen, README, AGENTS.md, CONTRIBUTING.md | Non-technical user can install and start their first project using only the README |

***

## 12. Open Source Strategy

FlowBench is published under the MIT License with:

- **README.md** — plain English, installation in five steps, clear explanation of who it is for.
- **AGENTS.md** — OpenCode rules file for the FlowBench repo itself, so OpenCode can help build and maintain FlowBench.
- **CONTRIBUTING.md** — lightweight guide for adapter contributors.
- **`adapters/` directory** — structured to accept community adapters without touching core orchestration logic.

The project's opening pitch to the community: **"A workflow harness for builders who want to create apps without becoming programmers."** That framing is distinct from everything currently in the ecosystem, which targets professional developers.[^6][^9][^8]

***

## 13. What Success Looks Like

### V1 is successful when

A hobbyist builder who has never opened a terminal can:

1. Install FlowBench and follow the README to start a project.
2. Paste in a scope and trigger master plan generation.
3. Run sharpening iterations until the plan is unambiguous.
4. Work through a full phase loop — plan, sharpen, build, review, test, fix, handoff — without manually prompting the coding agent at each step.
5. Return to the project after a week, see exactly where it was left off, and continue the next phase without re-explaining context.
6. Do the same thing with an existing running app they want to improve.

### The deeper success

A builder who uses FlowBench for three months can describe their process in plain, confident terms: "I write down what I want to build, get a plan, work through it phase by phase, review what was done, test it, fix problems, and hand off cleanly to the next phase." That is a coherent craft. That is what FlowBench is for.

---

## References

1. [The No-Code Credit Trap: How AI Builders Are Quietly Draining Your Budget](https://dev.to/pawel_reszka/the-no-code-credit-trap-how-ai-builders-are-quietly-draining-your-budget-20p4) - You started with a simple idea. A quick prototype. You picked Lovable, Replit, or Bolt because they....

2. [The Hidden Costs of Vibe Coding | VibeCompare](https://vibecompare.dev/guides/hidden-costs-of-vibe-coding/) - Most vibe coding tools use credit-based or token-based pricing. The monthly fee buys you a pool of c...

3. [The real cost of vibe coding: what Lovable and Bolt won't tell you | Savi](https://savibm.com/blog/vibe-coding-hidden-costs/) - You're burning 400 credits an hour fixing AI mistakes. 30-40% of your prompts go to debugging. Here'...

4. [Vibe coding is fun until lock-in kills your app (how we avoid it)](https://www.reddit.com/r/vibecoding/comments/1owhkm1/vibe_coding_is_fun_until_lockin_kills_your_app/) - Vibe coding is fun until lock-in kills your app (how we avoid it)

5. [Built a vibe coding platform to solve the most important problem - Pricing & Flexibility.](https://www.reddit.com/r/SaaS/comments/1r63akb/built_a_vibe_coding_platform_to_solve_the_most/) - Built a vibe coding platform to solve the most important problem - Pricing & Flexibility.

6. [Best AI Coding Tools for Non-Coders and Vibe Coding 2026 - Toolient](https://www.toolient.com/2026/02/best-ai-coding-tools-non-coders-vibe-coding.html?m=1) - AI coding tools for non-coders in 2026 with real production insights, risks, failures, and when vibe...

7. [42 Agent Architecture Patterns: From Skill Repos to Intent & Harness Engineering](https://www.youtube.com/watch?v=qJE2G-Rdq9Y&time_continue=2) - From A Pattern Language of Agentic AI Skills Design https://intuitionmachine.gumroad.com/l/aiskills
...

8. [AI Vibe Coding Tools Test Shows Mixed Results for Non-Developers](https://blockchain.news/news/ai-vibe-coding-tools-test-non-developers-2026) - A hands-on test of 5 AI coding platforms reveals stark differences in usability for beginners, with ...

9. [FlowBench-Product-Scope-v1.0.md](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/collection_b650002f-196f-4ee0-a87d-340e9b9ad50e/b24535fb-d627-4562-8ee6-09eaf0f4a882/FlowBench-Product-Scope-v1.0.md) - An open-source workflow console for hobbyist app builders who want to create small software projects...

10. [I don’t touch any code, it’s all agentic using cursor. I switched from the IDE to agent view and I’m never going back it’s too good](https://www.perplexity.ai/search/b65c4015-9ddd-4ed7-9ec9-a8dda76197b1) - That actually puts you in a really nice spot: if you’re staying in Cursor’s agent view, the “stack c...

11. [No I still want to build, I love the process and other than my cursor sub it’s free for hobbyists to get stuff hosted so it literally costs me nothing or very little outside of the cursor sub](https://www.perplexity.ai/search/1de82a98-1b40-4336-9df2-7edd2bcb795b) - Then the clean answer is: yes, it’s rational to renew and keep building—because you enjoy the proces...

12. [Agent Workflows as Code: Why State Machines Beat Prompt ...](https://www.developersdigest.tech/blog/agent-workflows-as-code-state-machines) - Aharness, LangChain's custom harness pattern, and OpenAI's code-first migration all point to the sam...

13. [Commands | OpenCode](https://opencode.ai/docs/commands/) - Create custom commands for repetitive tasks.

14. [OpenCode: AI coding agent tool built for terminal, 100% open ...](https://jimmysong.io/ai/opencode/) - An AI coding agent tool built for terminal, 100% open source and vendor-agnostic, focused on termina...

15. [OpenCode: A model-neutral AI coding assistant](https://developers.redhat.com/articles/2026/04/22/opencode-model-neutral-ai-coding-assistant-openshift-dev-spaces) - Discover OpenCode, a model-neutral AI coding assistant that supports over 75 providers, including Op...

