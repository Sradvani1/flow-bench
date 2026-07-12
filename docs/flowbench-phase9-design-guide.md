# FlowBench — Phase 9 Frontend Design Guide
**Version 1.0 | Phase 9 Scope Document**
*Authoritative reference for all Phase 9 UI/UX implementation decisions*

---

## 0. Purpose and Authority

This document is the **design contract** for Phase 9. It defines the visual language, interaction model, layout system, component grammar, and acceptance criteria for the FlowBench frontend. It does not change the workflow contract, state machine, API surface, or artifact schemas. Every Phase 9 frontend implementation decision must trace back to a rule in this guide. If a conflict exists between this guide and the workflow contract (`workflow-contract.json`), the workflow contract governs state and behavior; this guide governs presentation.

**Goal:** Replace the current functional-but-unstyled frontend with a modern, minimalist, zero-CLI experience that a non-technical hobbyist builder can operate with confidence from first launch through project completion.

---

## 1. Product Personality

FlowBench is a **calm local workbench**, not a dashboard, not a developer tool, and not an AI agent console. Every design decision should reinforce these attributes:

| Attribute | What it means in the UI |
|---|---|
| **Calm** | Neutral surfaces, restrained color, no visual noise. Only signal, never decoration. |
| **Local-first** | Feels like a desktop app. No cloud iconography, no connectivity indicators, no SaaS chrome. |
| **Workflow-centric** | The current stage and next valid action are always the most prominent elements. |
| **Readable** | Artifacts read like well-formatted documents, not JSON dumps or database records. |
| **Trustworthy** | Every action is described in plain English before it runs. No surprises. |
| **Approachable** | Non-technical users are the primary audience. Language, layout, and feedback must assume zero coding knowledge. |

**Design anti-patterns to avoid:**
- Purple/indigo gradient "AI product" aesthetics
- Neon accent colors or glow effects
- Dense developer-tool chrome with icon toolbars
- Identical three-column feature-grid sections
- Centered everything with drop shadows on every card
- Raw JSON exposed in any primary surface
- Status indicators using only color (must always pair color with a label)

---

## 2. Design References

| Reference | What to borrow | What to ignore |
|---|---|---|
| **Linear** | Dense-but-calm workspace, status badge discipline, restrained sidebar navigation, phase queue list patterns, keyboard-first interaction, purposeful micro-animations | Issue tracker complexity, team/workspace chrome, metrics dashboards |
| **Obsidian** | Document-centered reading experience, local-first feel, readable long-form content, understated knowledge-work aesthetic | Plugin architecture UI, graph view metaphors, heavy settings surfaces |
| **Raycast** | Action-oriented command layer, keyboard confirmation flows, crisp contextual feedback, compact and focused action pane | Launcher metaphor, spot-search paradigm applied to workflow states |

**Synthesis statement:** FlowBench should feel like Obsidian's reading experience combined with Linear's workflow discipline and Raycast's action clarity — inside a local desktop app shell.

---

## 3. Design Tokens

All implementations must define and use these tokens. No hardcoded hex values, pixel values, or font sizes outside this system.

### 3.1 Typography

```css
/* Font families */
--font-display: 'Instrument Serif', Georgia, serif;     /* Headings 24px+ */
--font-body:    'Inter', 'Helvetica Neue', sans-serif;  /* All UI text */
--font-mono:    'JetBrains Mono', 'Menlo', monospace;   /* Code, paths, IDs */

/* Type scale — fluid clamp() */
--text-xs:   clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);  /* 12px → 14px */
--text-sm:   clamp(0.875rem, 0.8rem  + 0.35vw, 1rem);      /* 14px → 16px */
--text-base: clamp(1rem,     0.95rem + 0.25vw, 1.125rem);   /* 16px → 18px */
--text-lg:   clamp(1.125rem, 1rem    + 0.75vw, 1.5rem);     /* 18px → 24px */
--text-xl:   clamp(1.5rem,   1.2rem  + 1.25vw, 2.25rem);    /* 24px → 36px */
--text-2xl:  clamp(2rem,     1.2rem  + 2.5vw,  3.5rem);     /* 32px → 56px */
```

**Rules:**
- Display font (`Instrument Serif`) is used ONLY for artifact document titles, the project name in the header, and the welcome screen heading. Nothing else.
- All interactive elements, labels, badges, captions, and body text use the body font (`Inter`).
- Monospace font is used for file paths, run IDs, state machine keys, and inline code snippets in artifact bodies. Never for headings or UI chrome.
- Minimum text size: 12px (`--text-xs`). No exceptions.
- Body copy in artifact cards: `--text-base` (16px). Action buttons: `--text-sm` (14px).

### 3.2 Color System — Light and Dark Mode

FlowBench uses a warm neutral foundation with a single teal accent. Semantic status colors are used only for state and feedback signals — never decoratively.

```css
/* ── LIGHT MODE ─────────────────────────────────────────── */
:root, [data-theme="light"] {

  /* Surfaces */
  --color-bg:              #f5f4f0;   /* App background — warm off-white */
  --color-surface:         #f9f8f5;   /* Primary panel surface */
  --color-surface-2:       #fdfcfa;   /* Elevated surface (cards, modals) */
  --color-surface-inset:   #edeae5;   /* Inset areas (sidebar, code blocks) */
  --color-divider:         #dcd9d5;   /* Dividers and separators */
  --color-border:          #d0cdc8;   /* Component borders */

  /* Text */
  --color-text:            #1e1c17;   /* Primary text */
  --color-text-muted:      #7a7872;   /* Secondary labels, captions */
  --color-text-faint:      #b5b4af;   /* Placeholder text, tertiary info */
  --color-text-inverse:    #f9f8f4;   /* Text on dark/colored backgrounds */

  /* Primary action accent — Teal */
  --color-primary:         #0a6b6e;
  --color-primary-hover:   #095355;
  --color-primary-active:  #063a3c;
  --color-primary-muted:   #d4e4e4;   /* Accent-tinted surface for selected items */

  /* Status colors — semantic use only */
  --color-success:         #3d7c24;   /* Completed, healthy, passing */
  --color-success-muted:   #d3e4cc;
  --color-warning:         #9a4a00;   /* Attention, interrupted, fixing */
  --color-warning-muted:   #f0dfd0;
  --color-error:           #9b2c2c;   /* Blocked, failed, destructive risk */
  --color-error-muted:     #f2d9d9;
  --color-info:            #2c5fa0;   /* In-progress, building, reviewing */
  --color-info-muted:      #d0dcf0;

  /* Shadows */
  --shadow-sm:  0 1px 2px oklch(0.15 0.01 80 / 0.05);
  --shadow-md:  0 4px 12px oklch(0.15 0.01 80 / 0.08);
  --shadow-lg:  0 12px 32px oklch(0.15 0.01 80 / 0.12);

  /* Border radius */
  --radius-sm:  0.25rem;   /* 4px — compact badges, chips */
  --radius-md:  0.5rem;    /* 8px — inputs, buttons */
  --radius-lg:  0.75rem;   /* 12px — cards, panels */
  --radius-xl:  1rem;      /* 16px — modals, dialogs */
  --radius-full: 9999px;   /* Pills */

  /* Transitions */
  --transition-fast:        120ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-interactive: 180ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-slow:        280ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── DARK MODE ──────────────────────────────────────────── */
[data-theme="dark"] {
  --color-bg:              #141312;
  --color-surface:         #1a1917;
  --color-surface-2:       #1e1d1b;
  --color-surface-inset:   #131211;
  --color-divider:         #252422;
  --color-border:          #302e2c;
  --color-text:            #ccc9c4;
  --color-text-muted:      #7a7872;
  --color-text-faint:      #4a4946;
  --color-text-inverse:    #1a1917;
  --color-primary:         #4a9ea8;
  --color-primary-hover:   #3a8d97;
  --color-primary-active:  #2a7680;
  --color-primary-muted:   #1e3032;
  --color-success:         #5ea83e;
  --color-success-muted:   #1e2e18;
  --color-warning:         #c97c3a;
  --color-warning-muted:   #2e1e0e;
  --color-error:           #c85050;
  --color-error-muted:     #2e1515;
  --color-info:            #4e82cf;
  --color-info-muted:      #131d2e;
  --shadow-sm:  0 1px 2px oklch(0 0 0 / 0.2);
  --shadow-md:  0 4px 12px oklch(0 0 0 / 0.3);
  --shadow-lg:  0 12px 32px oklch(0 0 0 / 0.4);
}
```

**Color rules:**
- The teal primary is used ONLY for the primary CTA button and active state indicators. Not for headings, borders, backgrounds, or decorative elements.
- Status colors are paired with a text label. A green badge always says "Complete" — never relies on color alone.
- No colored left-border cards. Cards use surface elevation (background shift + shadow).
- The error color is reserved for truly blocked/failed states. Do not use it for normal secondary actions.

### 3.3 Spacing

```css
--space-1:  0.25rem;   /*  4px */
--space-2:  0.5rem;    /*  8px */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
```

All padding, margin, and gap values must reference a spacing token.

---

## 4. Layout System

### 4.1 Desktop Shell (≥ 1024px)

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER                                             [gear]  │
│  Project Name  ·  Mode badge  ·  Stage label  ·  Last updated│
├──────────────┬──────────────────────────────┬───────────────┤
│   LEFT RAIL  │    ARTIFACT WORKSPACE        │  RIGHT PANEL  │
│              │                              │               │
│  Command     │  Document-style artifact     │  Phase queue  │
│  Pane        │  viewer/editor               │               │
│              │                              │  Active phase │
│  Next action │  Title                       │  stage        │
│  (primary)   │  ─────────────               │               │
│              │  Section 1...                │  Run status   │
│  Other valid │                              │  indicator    │
│  actions     │  Section 2...                │               │
│              │                              │  [Timeline]   │
│  ─────────── │                              │  tab          │
│  Status info │                              │               │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

**Dimensions:**
- Left rail: `260px` fixed width. Scrolls independently.
- Right panel: `280px` fixed width. Scrolls independently.
- Artifact workspace: fills remaining space. Max content width `720px`, centered with auto margins.
- Header: `56px` fixed height, sticky at top.
- Right panel is collapsible on desktop — a `>` toggle icon at its left edge hides it to give more artifact reading space.

### 4.2 Responsive — Medium (768px – 1023px)

Left rail collapses into a slide-in drawer triggered by a menu button in the header. Right panel hides by default; accessible via a "Queue" tab in the header. Artifact workspace fills the full width at `max-width: 680px`.

### 4.3 Responsive — Mobile (< 768px)

Three-pane layout is replaced by a single-screen view with bottom navigation:

```
┌─────────────────────────────────────────┐
│  HEADER (project name + stage badge)    │
│  [≡]                           [gear]   │
├─────────────────────────────────────────┤
│                                         │
│  PRIMARY CONTENT AREA                   │
│  (artifact or action view)              │
│                                         │
│                                         │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  [ Actions ]  [ Artifact ]  [ Queue ]   │
└─────────────────────────────────────────┘
```

Bottom navigation has three tabs: Actions (the command pane), Artifact (the reading workspace), and Queue (phase queue). The active tab's content fills the content area. Touch targets minimum 44px.

### 4.4 Layout rules
- One primary scroll region per view. No nested scrollable areas except the artifact workspace and the timeline panel (which is a contained scroll region).
- Sticky header at all breakpoints.
- The left rail does not scroll with the page — it is an independent fixed-height panel.
- The artifact workspace is the only panel that approaches a full document reading experience. Treat it like a text editor content area.

---

## 5. Screen Specifications

### 5.1 Welcome / No Project Screen

Shown when no `current-state.json` exists. This is the first screen a new user sees.

**Content:**
- FlowBench logotype (display font, `--text-xl`)
- One-sentence description: *"A workbench for running your software projects through a repeatable build loop."*
- Two clearly separated options presented as cards:
  - **Start a new build** — *"I have an idea and want to build something new."*
  - **Work on an existing app** — *"I have a codebase I want to improve."*
- Each card includes a short plain-English description (2 sentences max), a chevron icon, and a hover state.

**Interaction:**
- Clicking either card opens the New Project flow (see 5.2).
- No other navigation, no settings access, no empty state. This screen exists only until a project is created.

**Design note:** No hero illustration, no animated gradient, no tagline. The two action cards are the entire page. Generous whitespace. Single column.

---

### 5.2 New Project Flow (Modal/Dialog)

A multi-step dialog. Never navigates away from the current page.

**Step 1 — Project name and mode**
- Input: Project name (plain text, required, max 80 chars)
- Radio group: New Build / Existing App (with one-line descriptions)
- Next button

**Step 2a — New Build: Repo path**
- Input: Absolute path to project directory
- Inline path validation: green checkmark when path exists and is writable, red error with plain-English message when not
- Helper text: *"This is where your project code lives. FlowBench will create a `.flowbench/` folder here to store its records."*
- Back / Create Project buttons

**Step 2b — Existing App: Repo path + audit notice**
- Same path input as 2a
- Notice card: *"FlowBench will scan this directory to understand what's already there. This is read-only — nothing will be changed."*
- Back / Start Audit buttons (clicking Start Audit creates the project and immediately triggers the audit adapter action)

**Design rules:**
- Progress indicator at top: Step 1 of 2 (dots, not numbers)
- Error messages appear inline immediately below the relevant input
- No confirmation dialog on top of this dialog — the flow itself is the confirmation
- Dialog width: 480px max. Centered. Backdrop blur on the page behind it.

---

### 5.3 Main Workspace — Header

**Left side:**
- Project name (display font, `--text-lg`, truncated at 240px)
- Mode badge: "New Build" or "Existing App" — small neutral pill badge
- Stage label: plain English stage name from the workflow contract (e.g., "Scope Ready", "Phase 3 · Building") — `--text-sm` muted

**Right side:**
- Last updated timestamp (relative: "2 minutes ago") — `--text-xs` faint
- Theme toggle (sun/moon icon)
- Settings gear icon

**Height:** 56px. No bottom border — use shadow or background differentiation instead.
**Background:** `--color-surface`, one level above the app background.

---

### 5.4 Left Rail — Command Pane

The command pane shows the actions valid for the current workflow state. It is never empty — if no adapter actions are available, it shows informational content about the current state.

**Structure (top to bottom):**

**Section A — Primary action (always first)**
- One large primary button: the most important next action
- Uses `--color-primary` fill, white label, `--text-sm` weight 500
- Width: full rail width minus padding
- Below the button: one sentence of plain-English description of what this action does (from the workflow contract's action description field)
- Example: *"Generate Master Plan → FlowBench will create a full project plan from your scope."*

**Section B — Other valid actions**
- Rendered as secondary ghost buttons with border
- Listed in order of: system actions first, adapter actions second, navigation actions last
- Each shows its label and a one-line description
- Risky actions show a warning-colored icon (⚠) to the left of the label — not a badge, just an icon

**Section C — Status block (bottom of rail)**
- Current run status if a run is active: spinner + "Building Phase 3..." with elapsed time
- Auto-dispatch indicator: if review or test auto-dispatched, show "Reviewing automatically..." in muted text
- No active run: show last completed action and timestamp in faint text

**Rules:**
- Fixed height, independent scroll
- If more than 5 actions are listed, the section scrolls internally with a fade gradient at the bottom
- Disabled actions (e.g., actions requiring preconditions) are shown greyed-out with a tooltip explaining why they are unavailable — never hidden entirely
- The primary action button must always be visible without scrolling

---

### 5.5 Artifact Workspace

The center panel is the document reading and editing area. It renders the artifact appropriate for the current state.

**Structure:**

```
┌──────────────────────────────────────────────┐
│  [Artifact type badge]   [Phase label]       │
│                                              │
│  Artifact Title                              │
│  (display font, --text-xl)                   │
│                                              │
│  ── ── ── ── ── ── ── ── ── ── (divider)     │
│                                              │
│  Section 1 heading                           │
│  Body content                                │
│                                              │
│  Section 2 heading                           │
│  Body content                                │
│                                              │
└──────────────────────────────────────────────┘
```

**Artifact card grammar (applies to all 11 artifact types):**
- Artifact type badge: small pill, neutral background, `--text-xs` — e.g., "Scope", "Master Plan", "Phase Plan"
- Title: from the artifact's content (e.g., project name for scope, phase name for phase plan). Display font.
- Divider: `--color-divider`, 1px
- Sections: each section has a heading (`--font-body bold`, `--text-base`) and body (`--font-body`, `--text-base`)
- Lists inside artifacts: bullet or numbered, left-aligned, `max-width: 65ch`
- Nested structure (e.g., phase queue items): displayed as a structured list with status badges on the right
- Code snippets, paths, IDs: `--font-mono`, `--text-sm`, inset background (`--color-surface-inset`)

**Per-artifact-type content map:**

| Artifact | Title | Key sections |
|---|---|---|
| Scope | Project name | Goal, Non-Goals, Constraints, Acceptance criteria |
| Master Plan | Project name + "Master Plan" | Overview, Phase list with summaries, Architecture decisions |
| Sharpening Notes | "Sharpening Notes" | Questions raised, Decisions made, Outstanding items |
| Phase Plan | Phase name + "Plan" | Goal, Scope, Acceptance criteria, Builder decisions required |
| Build Summary | Phase name + "Build Summary" | What was built, Files changed, Deviations, Known issues |
| Review Findings | Phase name + "Review" | Summary verdict, Issues found (by severity), What works correctly |
| Test Results | Phase name + "Test Results" | Suite results, Pass/fail counts, Failing tests list |
| Handoff Notes | Phase name + "Handoff" | What was built, What was tested, Known issues, Context for next phase |
| Phase Queue | Project name + "Phase Queue" | List of phases with status, dependencies, ETA |
| Audit Report | Project name + "App Audit" | Framework detected, Directory structure, Entry points, Dependencies, Tests |
| Event Log | "Event Timeline" | Displayed in the Timeline tab, not the artifact workspace |

**Scope artifact special rule:** In `scope_ready` state only, the scope body is editable (a plain textarea that submits on blur or explicit save). In all other states it is read-only.

**Empty state:** When no artifact exists for the current state, show a centered card with:
- Icon (document outline)
- Heading: plain English description of what this artifact will contain
- Body: *"This will be created when you [action label]."*
- Primary action button (same as the command pane primary action)

---

### 5.6 Right Panel — Phase Queue and Run Status

**Tab A — Queue (default)**

A vertical list of all phases. Each item:
```
  [status dot]  Phase 1 · Foundation              [Complete ✓]
  [status dot]  Phase 2 · Console UI              [Complete ✓]
  [status dot]  Phase 3 · OpenCode Adapter        [In Progress →]
  [status dot]  Phase 4 · Artifacts               [Upcoming]
  [status dot]  Phase 5 · Approval System         [Upcoming]
```
- Status dot colors: green (complete), blue (in-progress), neutral (upcoming), yellow (fixing), red (blocked), grey (skipped)
- Active phase row: slightly elevated background using `--color-primary-muted`
- Completed phases: faint text, checkmark
- Clicking a phase expands inline: shows phase goal in 1–2 sentences. Does not navigate away.
- Reorder handle (⠿) visible on hover for upcoming phases only. Drag-to-reorder using the phase management rules from the workflow contract.
- Phase count label at top: "Phase 2 of 5 complete"

**Tab B — Timeline**

A reverse-chronological event log.
- Each entry: timestamp (relative on hover → absolute), plain-English description, level badge (Project / Phase)
- Level filter: All / Project / Phase — tab strip at top of panel
- Load more button at bottom
- 50 events per page (matches API pagination)
- Group by date: "Today", "Yesterday", then dates

---

### 5.7 Settings Screen (Modal)

Opened from the gear icon. Presented as a full-screen modal with sections, not a separate route.

**Sections:**

**Project**
- Project name (editable text input)
- Mode display (read-only badge — mode changes require creating a new project)
- Repository path (display only, with a "Change" link that opens a path picker with validation)
- Backend health: green dot "Connected" or red dot "Unreachable" — updates on open

**New Project**
- Button: "Start a new project" — opens the New Project flow and ends the current project (requires confirmation if a project is in progress)

**Adapter**
- Adapter name (read-only: "OpenCode")
- Adapter health: status indicator
- Adapter version: displayed if available

**Policies**
- Risk category toggles: each category (modify_files, install_packages, destructive, git_operation, config_change) has a toggle and its plain-English description
- Toggle ON = require approval before dispatching. Toggle OFF = auto-approve that category.

**Appearance**
- Theme: Light / Dark / System (radio group)

**About**
- FlowBench version
- Link to README

**Footer:**
- Close button only. No Save — all changes apply immediately with inline confirmation.

---

### 5.8 Approval Dialog

Triggered when a risky action is dispatched without prior confirmation.

**Content:**
- Title: "Confirm: [Action label]"
- Risk explanation: verbatim from the policy engine. Rendered as a well-formatted paragraph — not an error box.
- Risk category badge: e.g., "Modifies files" — amber color, small pill
- Two buttons:
  - **Yes, go ahead** — primary, `--color-primary`
  - **No, don't do this** — secondary ghost button
- Below the buttons: *"Nothing will happen if you close this dialog or click 'No'."*

**Keyboard:**
- Enter → confirm
- Escape → cancel

**Accessibility:**
- Focus trap inside dialog
- First focus on "No, don't do this" button (safer default)
- `aria-modal="true"`, `role="alertdialog"` for destructive risk categories

**Design rules:**
- Never use red for this dialog unless the risk category is `destructive`
- The dialog explains what will happen in plain English. No technical jargon.
- Dialog max-width: 440px. Centered with backdrop.

---

### 5.9 Recovery Banner (Interrupted Run)

Shown as a sticky banner below the header when an interrupted run is detected on startup.

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠  Work may have stopped unexpectedly.  What do you want to │
│    do?  [Inspect] [Retry] [Continue] [Revise Plan]   [✕]   │
└─────────────────────────────────────────────────────────────┘
```

- Background: `--color-warning-muted`, border: `--color-warning` (1px bottom)
- Four action buttons: pill-style, small
- Dismiss (✕): clears the banner only, does not affect state
- Plain-English tooltips on each button explaining what it will do
- Not dismissible by clicking outside — must use one of the four actions or the ✕

**Button behaviors:**
- **Inspect** — scrolls artifact panel into view, shows a toast confirming
- **Retry** — dispatches retry with `confirmed: true`, creates new RunRecord
- **Continue** — dismisses banner, polling resumes
- **Revise Plan** — dispatches `replan_phase` (if inside a phase) or `replan_from_here` (if at project level)

---

### 5.10 Blocked State Card

Shown in the artifact workspace when `project_blocked` or `phase_blocked` is the current state.

```
┌─────────────────────────────────────────────────────────────┐
│  [Blocked]  Phase needs attention                           │
│                                                             │
│  What happened                                              │
│  ─────────────────────────────────────────────────────────  │
│  [failure_message from RunRecord, or last event description]│
│                                                             │
│  What you can do                                            │
│  ─────────────────────────────────────────────────────────  │
│  [Recovery action buttons — one per row, with description]  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- "Blocked" badge: `--color-error` background, white text
- "What happened" content: from `active_run.failure_message` first, then last event description, then generic fallback. Never raw technical output.
- Recovery actions: same as command pane actions but presented as full-width buttons with their description
- No raw error codes, no stack traces, no JSON

---

### 5.11 Active Run Indicator

When a run is in progress (building, reviewing, testing, fixing), show a persistent non-blocking indicator.

**Position:** Bottom-left of the artifact workspace, fixed inside the workspace container.

```
  ⟳  Building Phase 3 · Foundation      01:23
```

- Animated spinner (subtle rotation, respects `prefers-reduced-motion`)
- Action label: plain-English name of the currently running adapter action
- Elapsed time: `MM:SS` format
- Clicking it scrolls the event timeline to the most recent entry
- Color: `--color-info` for normal runs, `--color-warning` for review/test runs (auto-dispatched)

Auto-dispatch indicator (review/test running automatically):
```
  ⟳  Reviewing automatically…            00:45
```
Muted text beneath: *"FlowBench is reviewing the build automatically. You'll see the results when it's done."*

---

### 5.12 Project Complete Screen

When `project_complete` is the state, the artifact workspace shows a dedicated completion view.

**Content:**
- Completion heading: "Project Complete" (display font, `--text-xl`)
- Project name and dates (started, completed)
- Phase completion summary: "5 of 5 phases complete"
- Phase list with completion checkmarks (compact version of the queue)
- Available actions from the workflow contract: View Summary, Archive Project

**Design:** Restrained. A single moment of positive reinforcement — a subtle green checkmark at the top, not confetti. The project record should feel like a completed document, not a celebration screen.

---

## 6. Component Specifications

### 6.1 Buttons

| Variant | Use | Style |
|---|---|---|
| **Primary** | Main next action | `--color-primary` fill, white text, `--radius-md`, `--text-sm` 500 weight |
| **Secondary** | Other valid actions | Transparent fill, `--color-border` border, `--color-text` text |
| **Ghost** | Tertiary, navigation | No border, no fill. `--color-text-muted` text. Hover: subtle background |
| **Destructive** | Cancels, deletes | `--color-error` border, `--color-error` text. Fill only on hover. |
| **Disabled** | Unavailable actions | All variants: opacity 0.4, `cursor: not-allowed`, tooltip required |

Height: 36px standard, 32px compact (inside panels), 40px for primary CTA on wide layouts.
All buttons: `min-width: 0`, label does not truncate — button grows to fit text.

### 6.2 Badges / Status Pills

- Size: `--text-xs`, `--radius-full`, `padding: 2px 8px`
- Always pair color with a text label
- Never use colored left-border pattern

| Status | Background | Text color |
|---|---|---|
| Complete | `--color-success-muted` | `--color-success` |
| In Progress | `--color-info-muted` | `--color-info` |
| Blocked | `--color-error-muted` | `--color-error` |
| Fixing | `--color-warning-muted` | `--color-warning` |
| Upcoming | `--color-surface-inset` | `--color-text-muted` |
| Skipped | `--color-surface-inset` | `--color-text-faint` |
| New Build | `--color-primary-muted` | `--color-primary` |
| Existing App | `--color-surface-inset` | `--color-text-muted` |

### 6.3 Cards

Cards use surface elevation and shadow — not colored borders.

```css
.card {
  background: var(--color-surface-2);
  border: 1px solid oklch(from var(--color-text) l c h / 0.08);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-6);
}
.card:hover { box-shadow: var(--shadow-md); }
```

Never use `border-left: 3px solid <color>` on cards.

### 6.4 Form Inputs

```css
.input {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  font-size: var(--text-sm);
  color: var(--color-text);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-muted);
}
.input-error { border-color: var(--color-error); }
```

Validation errors appear immediately below the input in `--color-error`, `--text-xs`. Error text is specific: *"Path does not exist"* not *"Invalid input"*.

### 6.5 Skeleton Loaders

Show skeleton loaders (not spinners) when fetching initial data.

```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-inset) 25%,
    var(--color-surface) 50%,
    var(--color-surface-inset) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}
```

Skeleton structure mirrors the real component. Use distinct heights for heading vs. body skeleton bars.

### 6.6 Toast Notifications

- Position: bottom-right, stacked
- Duration: 4 seconds for info/success. Persistent (requires dismiss) for errors.
- Max 3 toasts visible at once. Oldest auto-dismissed first.
- Content: one line of plain-English text. No titles, no icons required, but icons allowed.
- Never use toasts for critical state changes — those go in the command pane or blocking overlays.

---

## 7. Interaction Patterns

### 7.1 Polling and Real-Time Feedback

- Active state polling: 2-second interval. Inactive state: 5 seconds.
- ETag/`updated_at` short-circuit: no re-render if state unchanged.
- When a run starts: immediately show the active run indicator. Do not wait for the next poll.
- When a run completes: update the command pane and artifact workspace in the same poll cycle. No manual refresh required.
- Auto-dispatch completion: show a brief (2s) toast: *"Review complete — results ready."*

### 7.2 Keyboard Navigation

| Shortcut | Action |
|---|---|
| `?` | Open keyboard shortcuts reference |
| `Enter` | Confirm primary action (when command pane is focused) |
| `Escape` | Close any open dialog or dismiss recovery banner |
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + /` | Focus command pane |
| `Tab` | Cycle through interactive elements |

All interactive elements must be keyboard-reachable via Tab. Focus ring: 2px `--color-primary` outline, 3px offset.

### 7.3 Loading and Progress

- **Initial app load:** Skeleton loaders for all three panels simultaneously. No blank white flash.
- **Action dispatch:** Primary button shows a spinner after click. Disable further clicks until the action resolves (prevents double-dispatch).
- **Long-running adapter actions:** Active run indicator (see 5.11). The command pane primary button is replaced with a "Running…" disabled state while the run is active.
- **Path validation:** Debounced 300ms after input change. Show spinner inside input while validating, then result.

### 7.4 Empty and Error States

Every panel must handle its empty and error states explicitly:

| Panel | Empty state | Error state |
|---|---|---|
| Artifact workspace | Document placeholder with next-action suggestion (see 5.5) | "Could not load artifact. [Retry]" link |
| Phase queue | "No phases yet — accept the master plan to create the phase queue." | "Could not load queue. [Retry]" |
| Timeline | "No events yet — events appear here as you work through your project." | "Could not load timeline. [Retry]" |
| Command pane | Never empty — always shows state description if no actions available | Show "Backend unreachable" with settings link |

---

## 8. Onboarding and First-Run Experience

The entire first-run experience must be completable without opening a terminal.

### 8.1 First Launch (No Project)

See screen 5.1. No tutorial overlay, no empty dashboard. The two action cards are self-evident.

### 8.2 First Project Creation

- New Project flow (5.2) provides all necessary guidance inline.
- Path input provides real-time validation so the user knows immediately if their chosen directory is valid.
- After project creation, the artifact workspace shows the Scope card with an editable textarea and a clear label: *"Describe what you want to build."* Below it, a subtle helper: *"Be as specific or general as you like. You can refine it later."*
- The primary action in the command pane reads: "Generate Master Plan" with the description: *"FlowBench will create a full project plan from your scope."*

### 8.3 Scope Editor (scope_ready state)

- Editable plain-text textarea, full width of the artifact workspace
- Character count visible at bottom-right (no hard limit in V1)
- Auto-saves on blur — toast confirms "Scope saved"
- "Generate Master Plan" button remains in the command pane while the user is editing

### 8.4 Progress Reinforcement

At each major milestone, provide a brief moment of acknowledgment:

- Master plan accepted → toast: *"Master plan accepted. Phase queue is ready."*
- Phase complete → toast: *"Phase [N] complete. Handoff reviewed."*
- Project complete → completion screen (5.12), no animation

These are functional signals, not celebrations. Keep them brief.

---

## 9. Accessibility

All requirements are non-negotiable.

- **Semantic HTML:** `<header>`, `<nav>`, `<main>`, `<aside>`, `<section>` — no `<div>` where a semantic element exists
- **Heading hierarchy:** One `<h1>` per page (project name or screen title). `<h2>` for section headings within artifacts. `<h3>` for sub-sections.
- **Color contrast:** WCAG AA minimum — 4.5:1 for body text, 3:1 for large text (18px+)
- **Keyboard navigation:** All interactive elements reachable via Tab/Enter/Space/Escape. No keyboard traps except inside modal dialogs (where focus is intentionally trapped and Escape exits).
- **Focus indicators:** All focusable elements show a visible focus ring (defined in section 3.2)
- **Alt text:** All images have descriptive alt text. Decorative elements have `alt=""`
- **Touch targets:** Minimum 44x44px for all interactive elements
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` suppresses all animations
- **Screen reader labels:** All icon-only buttons have `aria-label`. Status indicators have `aria-live="polite"` for run-status updates.
- **Form labels:** Every input has an associated `<label>`. Required fields marked with `aria-required="true"`.
- **Status notifications:** Run completion and error states use `aria-live` regions so screen readers announce them without focus change.

---

## 10. Phase 9 Scope Boundaries

### In scope
- Implement and apply the design system defined in this guide
- Rework layout, typography, panels, artifact readability, action hierarchy, responsive behavior, and state feedback for all existing screens
- Implement the first-run / welcome screen and new project flow (currently command-line only)
- Implement the settings screen per section 5.7
- Add visual regression baseline screenshots for the six reference states
- Add component-level UI tests for all new components
- Ensure 35 existing frontend tests continue passing

### Out of scope
- Any changes to API endpoints, state machine, artifact schemas, or workflow contract
- New workflow states or actions
- Obsidian export or any external integration
- Analytics, usage tracking, or telemetry
- Multi-project support
- Code viewer or diff renderer
- Animations beyond the functional transitions defined in section 7

### Constraints
- Must use the existing Next.js / Tailwind / shadcn/ui stack
- May add fonts via Google Fonts CDN (Instrument Serif + Inter)
- The fixed 12-component shadcn/ui set from the master plan is already installed; do not add shadcn/ui components outside that set
- All data displayed comes from existing API endpoints; no new endpoints required for Phase 9

---

## 11. Visual Acceptance Criteria

Phase 9 is not accepted until all of the following are verified:

**Desktop (1440px):**
- [ ] Welcome screen renders correctly with two action cards
- [ ] New Project flow completes end-to-end with inline path validation
- [ ] Main workspace shows correct layout (header + three panels)
- [ ] Scope editor is editable in `scope_ready`, read-only otherwise
- [ ] Command pane shows primary action prominently with description
- [ ] Artifact workspace renders all 11 artifact types in document format (not JSON)
- [ ] Approval dialog triggers for risky actions, keyboard shortcuts work
- [ ] Recovery banner appears for interrupted runs with all four actions
- [ ] Blocked state card shows in artifact workspace with recovery actions
- [ ] Phase queue shows all phases with correct status colors and labels
- [ ] Timeline shows events with level filter working
- [ ] Settings screen opens as modal with all sections visible
- [ ] Project complete screen shows with phase summary
- [ ] Light and dark mode both look correct
- [ ] Active run indicator shows when a run is in progress
- [ ] Skeleton loaders appear during initial data fetch

**Mobile (375px):**
- [ ] Bottom navigation works for all three tabs
- [ ] New project flow is usable without horizontal scroll
- [ ] Artifact content is readable at mobile width
- [ ] Command pane actions are all tappable (44px min)
- [ ] Settings modal is usable on mobile

**Behavior:**
- [ ] 237 backend tests still pass
- [ ] All existing 35 frontend tests still pass
- [ ] Frontend build is clean
- [ ] No raw JSON visible in any primary surface under normal conditions
- [ ] No terminal required for any user-facing action

---

## 12. File and Component Naming Conventions

All new components follow this pattern:

| Type | Pattern | Example |
|---|---|---|
| Screen-level | `{screen-name}-screen.tsx` | `welcome-screen.tsx` |
| Panel | `{panel-name}-panel.tsx` | `command-pane-panel.tsx` |
| Artifact renderer | `{type}-renderer.tsx` | `phase-plan-renderer.tsx` |
| Dialog/modal | `{name}-dialog.tsx` | `approval-dialog.tsx` |
| Hook | `use-{resource}.ts` | `use-project-state.ts` |
| Utility | `{utility-name}.ts` | `format-relative-time.ts` |

CSS module files where needed: `{component-name}.module.css`

---

*End of Phase 9 Design Guide v1.0*
*Next step: Review and sharpen this guide, then build the Phase 9 implementation plan.*
