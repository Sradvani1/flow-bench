# Phase 9 — Frontend Design System Implementation

**Status**: Planned. Not yet implemented.

## Purpose

Replace the current functional-but-unstyled frontend with a modern, minimalist, zero-CLI experience based on the [Phase 9 Design Guide](../flowbench-phase9-design-guide.md). This implements the full visual language, layout system, component grammar, and interaction model defined in the guide — without changing any API endpoints, workflow states, or artifact schemas.

## Architecture

No backend changes. All work is in `apps/web/`. The existing single-page app is restructured from a hardcoded three-column layout into a responsive shell with a proper design token system, redesigned panels, document-style artifact rendering, and a complete first-run experience.

## Constraint Summary

- Must use existing Next.js / Tailwind / shadcn/ui stack
- Fixed 12-component shadcn/ui set: Button, Card, Badge, **Tabs**, ScrollArea, Separator, Skeleton, Toast, **Select**, **Switch**, Dialog, **DropdownMenu** (4 missing must be installed)
- All data from existing API endpoints — no new endpoints
- No new workflow states, actions, or artifact schemas
- All 35 existing frontend tests must continue passing
- `npm run build` must be clean

---

## Implementation Steps

### Step 0 — Design Token Foundation

**Files to modify:**
- `apps/web/src/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/utils.ts`

**Details:**

**0.1 — globals.css: Replace HSL color system with Phase 9 warm-neutral palette**

Replace the default shadcn/ui slate HSL variables with the Phase 9 design tokens from §3.2:

Light mode (`:root`):
- Surfaces: `--color-bg: #f5f4f0`, `--color-surface: #f9f8f5`, `--color-surface-2: #fdfcfa`, `--color-surface-inset: #edeae5`, `--color-divider: #dcd9d5`, `--color-border: #d0cdc8`
- Text: `--color-text: #1e1c17`, `--color-text-muted: #7a7872`, `--color-text-faint: #b5b4af`, `--color-text-inverse: #f9f8f4`
- Primary (teal): `--color-primary: #0a6b6e`, `--color-primary-hover: #095355`, `--color-primary-active: #063a3c`, `--color-primary-muted: #d4e4e4`
- Status: `--color-success: #3d7c24` + muted, `--color-warning: #9a4a00` + muted, `--color-error: #9b2c2c` + muted, `--color-info: #2c5fa0` + muted
- Shadows: OKLCH-based `--shadow-sm/md/lg`
- Border radius: `--radius-sm/md/lg/xl/full`
- Transitions: `--transition-fast/interactive/slow`

Dark mode (`[data-theme="dark"]`): corresponding dark values from §3.2.

Continue exposing values as CSS custom properties. Keep the `@layer base` with `* { @apply border-border; }` but remap to new custom properties.

Define the `@keyframes shimmer` animation (§6.5) in globals.css.

**0.2 — tailwind.config.ts: Add Phase 9 theme extensions**

```typescript
extend: {
  fontFamily: {
    display: ['"Instrument Serif"', 'Georgia', 'serif'],
    body: ['Inter', '"Helvetica Neue"', 'sans-serif'],
    mono: ['"JetBrains Mono"', 'Menlo', 'monospace'],
  },
  colors: {
    // Map to new CSS vars
    bg: 'var(--color-bg)',
    surface: 'var(--color-surface)',
    'surface-2': 'var(--color-surface-2)',
    'surface-inset': 'var(--color-surface-inset)',
    divider: 'var(--color-divider)',
    border: 'var(--color-border)',
    text: 'var(--color-text)',
    'text-muted': 'var(--color-text-muted)',
    'text-faint': 'var(--color-text-faint)',
    'text-inverse': 'var(--color-text-inverse)',
    primary: {
      DEFAULT: 'var(--color-primary)',
      hover: 'var(--color-primary-hover)',
      active: 'var(--color-primary-active)',
      muted: 'var(--color-primary-muted)',
    },
    success: { DEFAULT: 'var(--color-success)', muted: 'var(--color-success-muted)' },
    warning: { DEFAULT: 'var(--color-warning)', muted: 'var(--color-warning-muted)' },
    error: { DEFAULT: 'var(--color-error)', muted: 'var(--color-error-muted)' },
    info: { DEFAULT: 'var(--color-info)', muted: 'var(--color-info-muted)' },
  },
  borderRadius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    full: 'var(--radius-full)',
  },
  animation: {
    shimmer: 'shimmer 1.5s ease-in-out infinite',
  },
  keyframes: {
    shimmer: {
      '0%': { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition: '200% 0' },
    },
  },
}
```

Remove the old `accordion-down`/`accordion-up` keyframes if not used. Add the `skeleton` utility pattern.

**0.3 — layout.tsx: Load Google Fonts via next/font**

```typescript
import { Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google'

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})
```

Apply variables to `<html>` tag via `className`.

**0.4 — utils.ts: Add `formatAbsoluteTime`**

```typescript
export function formatAbsoluteTime(iso: string): string {
  return new Date(iso).toLocaleString()
}
```

Used for timeline hover-to-reveal-absolute behavior.

---

### Step 1 — Install Missing shadcn/ui Components

Install 4 missing components from the fixed 12-component set:
- `Tabs` — for Queue/Timeline tab switching in right panel
- `Select` — for dropdowns in settings if needed
- `Switch` — for policy risk-category toggles in settings
- `DropdownMenu` — installed but **not used in Phase 9**. Reserved for the phase management context menu in a future phase. Included now only to complete the approved 12-component set.

These are pre-approved by the master plan and do not violate the "no new shadcn/ui" constraint.

---

## Things to Watch During Build

These are not blocking issues but OpenCode should be aware of them before editing files.

**Step 6 — Command pane position change is a regression risk.** Moving the command pane from the right panel (280px) to the left rail (260px) changes a structural assumption that existing test mocks may depend on. Before touching `command-pane.tsx`, grep for any snapshot assertions or DOM queries tied to the old CSS class or position (e.g., `className="w-[280px]"`, `.command-pane`, or direct child selectors in page.tsx).

**Step 8 — File deletion requires import auditing.** `phase-queue.tsx` and `project-timeline.tsx` are removed and replaced by `queue-panel.tsx`. Before deleting, grep for imports of those two files across the entire `src/` directory — including tests, page.tsx, and any other component that may reference them — not just the files listed in Step 8.

**Step 15 — Scope editor state detection uses prop threading.** Add a `currentState: string` prop to `ScopeCard` (not a context or hook). `ArtifactPanel` passes the effective state string down. This keeps the component simple and avoids introducing a new context for a single use case.

---

### Step 2 — Layout Shell

**Files to create:**
- `src/components/app-shell.tsx`

**Files to modify:**
- `src/app/page.tsx`

**Details:**

The new layout replaces the hardcoded three-column + bottom-timeline structure:

Desktop (≥1024px):
```
[RecoveryBanner — conditional, sticky below header]
[Header 56px — sticky]
[Left Rail 260px | Artifact Workspace flex-1 max-w-720px | Right Panel 280px]
```

**app-shell.tsx:**
- Manages three breakpoints via CSS + React:
  - Desktop (≥1024px): three-column
  - Medium (768–1023px): left rail as slide-in overlay drawer, right panel hidden by default
  - Mobile (<768px): bottom tab navigation (Actions, Artifact, Queue)
- Right panel collapse: toggle button at left edge of right panel
- RecoveryBanner rendered conditionally above header
- Skeleton loaders visible while state query loads

**page.tsx:**
- Conditionally render WelcomeScreen when no project exists, AppShell otherwise
- Remove `min-w-[1280px]` constraint

---

### Step 3 — Welcome / No Project Screen (§5.1)

**Files to create:**
- `src/components/welcome-screen.tsx`

**Details:**
- Full-screen centered layout when `stateData.status === "no_project"`
- FlowBench logotype using display font (`--text-xl`)
- One-sentence description: *"A workbench for running your software projects through a repeatable build loop."*
- Two action cards with descriptions and chevron icons:
  - "Start a new build" — *"I have an idea and want to build something new."*
  - "Work on an existing app" — *"I have a codebase I want to improve."*
- Clicking either card opens the New Project dialog
- No illustration, no animation, no tagline. Just two cards with generous whitespace.

---

### Step 4 — New Project Flow Dialog (§5.2)

**Files to create:**
- `src/components/new-project-dialog.tsx`

**Details:**
- Two-step modal dialog (480px max-width, centered, backdrop blur)
- Progress indicator at top: step dots (●●, not numbers)
- **Step 1 — Project name and mode:**
  - Text input for project name (required, max 80 chars)
  - Radio group: New Build / Existing App with one-line descriptions
  - "Next" button
- **Step 2a — New Build: Repo path:**
  - Absolute path input with inline validation (debounced 300ms)
  - Green checkmark when path exists and is writable
  - Red error with specific message (e.g., "Path does not exist")
  - Helper text explaining `.flowbench/` folder
  - "Back" / "Create Project" buttons
- **Step 2b — Existing App: Repo path + audit notice:**
  - Same path input with validation
  - Notice card about read-only scan
  - "Back" / "Start Audit" buttons
- Error messages inline below relevant input
- No confirmation dialog on top of this dialog

---

### Step 5 — Redesign Header (§5.3)

**Files to modify:**
- `src/components/project-header.tsx`

**Details:**
- Height: 56px (currently 48px), sticky top
- Background: `--color-surface`, shadow-based separation (no bottom border)
- **Left side:**
  - Project name in display font (`--text-lg`, truncated at 240px)
  - Mode badge: pill, "New Build" = `--color-primary-muted` bg / `--color-primary` text, "Existing App" = `--color-surface-inset` bg / `--color-text-muted` text
  - Stage label: plain English, `--text-sm`, `--color-text-muted`
- **Right side:**
  - Last updated: relative timestamp, `--text-xs`, `--color-text-faint`
  - Theme toggle (sun/moon icon pair)
  - Settings gear icon
- No user-facing state changes to header behavior, only visual redesign

---

### Step 6 — Redesign Command Pane (§5.4)

**Files to modify:**
- `src/components/command-pane.tsx`

**Details:**
Move the command pane from the right panel (280px) to the left rail (260px). Complete restructure into three sections:

**Section A — Primary action:**
- Always the first (most important) valid action
- `--color-primary` fill button, white text, `--text-sm` weight 500, full width
- Below button: one-sentence plain-English description from action entry
- Primary button must always be visible without scrolling
- Shows spinner after click, disabled until action resolves

**Section B — Other valid actions:**
- Ghost buttons with `--color-border` border
- Listed: system → adapter → navigation (per action type order from API)
- Each shows label + description
- Risky actions show ⚠ warning-colored icon left of label
- Disabled actions: opacity 0.4, `cursor: not-allowed`, tooltip with reason
- If >5 actions, section scrolls with fade gradient at bottom

**Section C — Status block (bottom of rail):**
- Active run in progress: spinner + "Building Phase 3..." + elapsed time
- Auto-dispatch: "Reviewing automatically..." in muted text
- No active run: last completed action + timestamp in faint text

**Remove:** Inline no-project mode selector (moved to WelcomeScreen + NewProjectDialog)

---

### Step 7 — Redesign Artifact Workspace + All Artifact Renderers (§5.5)

**Naming convention decision:** The design guide (§12) specifies the pattern `{type}-renderer.tsx` (e.g., `phase-plan-renderer.tsx`). The existing files use `-card.tsx`. To avoid import-chain breakage across tests and the renderer map in `artifact-panel.tsx`, the existing files **keep their `-card.tsx` names** in this phase. New artifact renderers created in Phase 9 must use the `-renderer.tsx` convention per §12.

**Files to modify** (13 files + index):
- `src/components/artifact-panel.tsx`
- `src/components/artifacts/scope-card.tsx`
- `src/components/artifacts/master-plan-card.tsx`
- `src/components/artifacts/sharpening-notes-card.tsx`
- `src/components/artifacts/phase-plan-card.tsx`
- `src/components/artifacts/build-summary-card.tsx`
- `src/components/artifacts/review-findings-card.tsx`
- `src/components/artifacts/test-results-card.tsx`
- `src/components/artifacts/handoff-card.tsx`
- `src/components/artifacts/decision-card.tsx`
- `src/components/artifacts/audit-card.tsx`
- `src/components/artifacts/phase-queue-card.tsx`
- `src/components/artifacts/empty-state-card.tsx`
- `src/components/artifacts/index.ts`

**Details:**

**artifact-panel.tsx changes:**
- Add support for `ProjectCompleteScreen` renderer
- Pass `currentState` to scope card for edit-mode detection
- Update renderer map

**All artifact renderers — document-style grammar:**
- Remove shadcn Card wrapper (`Card`, `CardHeader`, `CardTitle`, `CardContent`)
- Replace with document layout:
  - Artifact type badge: small pill, neutral background, `--text-xs` (e.g., "Scope", "Master Plan")
  - Title: display font (`--text-xl`), from artifact content
  - Divider: `--color-divider`, 1px
  - Section headings: `--font-body` bold, `--text-base`
  - Body: `--font-body`, `--text-base`, `max-width: 65ch`
  - Lists: bullet or numbered, left-aligned
  - Code/paths/IDs: `--font-mono`, `--text-sm`, `--color-surface-inset` background
- Cards still use `--color-surface-2` background + `--shadow-sm` + `--radius-lg` for outer container

**Per-artifact content layout:**

| Component | Title | Sections |
|---|---|---|
| ScopeCard | Project name | Goal, Non-Goals, Constraints, Acceptance Criteria |
| MasterPlanCard | "Project Name Master Plan" | Overview, Phase list with summaries, Architecture Decisions |
| SharpeningNotesCard | "Sharpening Notes" | Questions Raised, Decisions Made, Outstanding Items |
| PhasePlanCard | "Phase Name Plan" | Goal, Scope, Acceptance Criteria, Builder Decisions Required |
| BuildSummaryCard | "Phase Name Build Summary" | What Was Built, Files Changed, Deviations, Known Issues |
| ReviewFindingsCard | "Phase Name Review" | Summary Verdict, Issues Found (by severity), What Works Correctly |
| TestResultsCard | "Phase Name Test Results" | Suite Results, Pass/Fail Counts, Failing Tests List |
| HandoffCard | "Phase Name Handoff" | What Was Built, What Was Tested, Known Issues, Context for Next Phase |
| PhaseQueueCard | "Project Name Phase Queue" | Phase list with status badges, dependencies, ETA |
| AuditCard | "Project Name App Audit" | Framework Detected, Directory Structure, Entry Points, Dependencies, Tests |

**EmptyStateCard:**
- Centered card with document outline icon
- Heading: plain English description of what artifact will contain
- Body: *"This will be created when you [action label]."*
- Primary action button (same as command pane primary action)

---

### Step 8 — Queue and Timeline Right Panel (§5.6)

**Files to create:**
- `src/components/queue-panel.tsx`

**Files to remove:**
- `src/components/phase-queue.tsx`
- `src/components/project-timeline.tsx`

**Files to modify:**
- `src/hooks/use-phase-queue.ts` — no changes needed (data shape unchanged)
- `src/hooks/use-events.ts` — no changes needed (already exported `level`, `setLevel`)

**Details:**

A 280px fixed-width right panel with two tabs using shadcn Tabs component.

**Tab A — Queue (default):**
- Phase count header: "Phase 2 of 5 complete"
- Vertical phase list. Each item:
  - Status dot + phase name + status label (e.g., "Complete ✓" or "In Progress →")
  - Status dot colors per §6.2: green (complete), blue (in-progress), neutral (upcoming), yellow (fixing), red (blocked), grey (skipped)
  - Active phase: `--color-primary-muted` background
  - Completed phases: `--color-text-faint` text + checkmark
  - Click expands inline (1-2 sentence goal), does not navigate away
  - Reorder handle on hover for upcoming phases only
- Empty state: "No phases yet — accept the master plan to create the phase queue."
- Error state: "Could not load queue. [Retry]"

**Tab B — Timeline:**
- Reverse-chronological event log
- Level filter: All / Project / Phase — tab strip at top
- Each entry: relative timestamp (hover→absolute), description, level badge
- Group by date: "Today", "Yesterday", then date headers
- "Load more" button at bottom when `hasMore` is true
- Empty state: "No events yet — events appear here as you work through your project."
- Error state: "Could not load timeline. [Retry]"

---

### Step 9 — Redesign Approval Dialog (§5.8)

**Files to rename:**
- `src/components/risk-confirmation-dialog.tsx` → `src/components/approval-dialog.tsx`

**Files to modify:**
- `src/components/command-pane.tsx` — update import

**Details:**
- Title: "Confirm: [Action label]"
- Risk explanation: verbatim from policy engine, well-formatted paragraph
- Risk category badge: amber pill, e.g., "Modifies Files"
- Buttons:
  - "Yes, go ahead" — primary teal fill
  - "No, don't do this" — secondary ghost (safer default, receives initial focus)
- Footer text: "Nothing will happen if you close this dialog or click 'No'."
- Keyboard: Enter → confirm, Escape → cancel
- Focus trap inside dialog
- `aria-modal="true"`, `role="alertdialog"` for destructive risk categories
- Never use red unless risk_category is `destructive`
- Dialog max-width: 440px, centered with backdrop

---

### Step 10 — Redesign Blocked State Card (§5.10)

**Files to modify:**
- `src/components/artifacts/blocked-state-card.tsx`

**Details:**
- "Blocked" badge: `--color-error` background, white text
- "What happened" section: `active_run.failure_message` (first), then last event description, then generic fallback. No raw technical output.
- "What you can do" section: recovery actions as full-width buttons with descriptions (one per row)
- No raw error codes, no stack traces, no JSON

---

### Step 11 — Redesign Recovery Banner (§5.9)

**Files to modify:**
- `src/components/recovery-banner.tsx`

**Details:**
- Sticky banner below header
- Background: `--color-warning-muted`, border-bottom: 1px `--color-warning`
- Content: ⚠ "Work may have stopped unexpectedly. What do you want to do?"
- Four pill-style action buttons: Inspect, Retry, Continue, Revise Plan
- Dismiss (✕) button at right edge — clears banner only, no API call
- Plain-English tooltips on each button
- Not dismissible by clicking outside

---

### Step 12 — Active Run Indicator (§5.11)

**Files to create:**
- `src/components/active-run-indicator.tsx`
- `src/hooks/use-elapsed-time.ts`

**Details:**

**use-elapsed-time.ts:**
- Takes a `startedAt` ISO timestamp
- Returns `elapsed: string` in MM:SS format
- Updates every second via `setInterval`
- Cleans up interval on unmount

**active-run-indicator.tsx:**
- Position: bottom-left of artifact workspace, fixed inside container
- Content: ⟳ animated spinner + action label + elapsed time
- Auto-dispatch variant: "⟳ Reviewing automatically… 00:45" with muted helper text
- Clicking scrolls event timeline to most recent entry
- Color: `--color-info` for normal runs, `--color-warning` for auto-dispatched
- Respects `prefers-reduced-motion`

---

### Step 13 — Project Complete Screen (§5.12)

**Files to create:**
- `src/components/project-complete-screen.tsx`

**Details:**
- "Project Complete" heading (display font, `--text-xl`)
- Project name + start/end dates
- "5 of 5 phases complete"
- Compact phase list with completion checkmarks
- Action buttons: View Summary, Archive Project
- Subtle green checkmark at top
- No confetti, no celebration — feels like a completed document

---

### Step 14 — Redesign Settings Screen (§5.7)

**Files to modify:**
- `src/components/settings-screen.tsx`

**Details:**
- Full-screen modal (large Dialog or full-screen overlay, not a separate route)
- Sections with headings:
  - **Project:** Name (editable text input), Mode (read-only badge), Repo path (display + "Change" link with path validation), Backend health (green dot "Connected" / red dot "Unreachable", refreshes on open)
  - **New Project:** "Start a new project" button — opens New Project flow, requires confirmation if project in progress
  - **Adapter:** Name (read-only: "OpenCode"), health indicator, version (if available)
  - **Policies:** Risk category toggles (shadcn Switch) with descriptions. Toggle ON = require approval for that category.
  - **Appearance:** Theme radio group: Light / Dark / System
  - **About:** FlowBench version, link to README
- Footer: Close button only (no Save — changes apply immediately)
- Use shadcn Dialog with wide content area

---

### Step 15 — Scope Editor Integration (§5.5 + §8.3)

**Files to modify:**
- `src/components/artifacts/scope-card.tsx`
- `src/components/artifact-panel.tsx`

**Details:**
- In `scope_ready` state only: scope body is an editable plain-text textarea, full width of artifact workspace
- Character count at bottom-right (no hard limit in V1)
- Auto-saves on blur — `postAction("edit_scope", { scope_content })` — toast confirms "Scope saved"
- "Generate Master Plan" button remains in command pane while editing
- In all other states: read-only document view with formatted sections
- Pass current state string through from `useCurrentArtifact` / `ArtifactPanel`

---

### Step 16 — Keyboard Shortcuts (§7.2)

**Files to create:**
- `src/hooks/use-keyboard-shortcuts.ts`

**Details:**

Define keyboard shortcut handler that attaches to `window`:

| Shortcut | Action |
|---|---|
| `?` | Show keyboard shortcuts reference (toast or minimal dialog) |
| `Enter` | Confirm primary action (when command pane focused) |
| `Escape` | Close any open dialog or dismiss recovery banner |
| `Cmd/Ctrl + ,` | Open settings |
| `Cmd/Ctrl + /` | Focus command pane primary button |

All interactive elements keyboard-reachable via Tab. Focus ring: 2px `--color-primary` outline, 3px offset.

---

### Step 17 — Update Toast System (§6.6)

**Files to modify:**
- `src/components/ui/toast.tsx`

**Details:**
- Position: bottom-right, stacked (already is)
- Duration: 4 seconds for info/success, persistent (manual dismiss) for errors
- Max 3 toasts visible at once; oldest auto-dismissed first
- Content: one line of plain-English text
- Icons allowed but not required
- Never use toasts for critical state changes (those go in command pane or blocking overlays)

---

### Step 18 — Accessibility Audit (§9)

**Scope:** Two bounded passes. Individual component steps (2–15) include their own accessibility requirements per the design guide spec.

**Pass A — Semantic HTML on panels and header:**
- `app-shell.tsx`: ensure `<header>`, `<main>`, `<aside>` for panels; `<nav>` for right-panel tabs; `<section>` for artifact content areas
- `project-header.tsx`: `<header>` with `<h1>` for project name
- `queue-panel.tsx`: `<nav>` with `aria-label="Queue"` / `aria-label="Timeline"`
- `command-pane.tsx`: `<nav>` with `aria-label="Actions"`, `<section>` for status block
- `artifact-panel.tsx`: `<article>` for artifact content, `<aside>` for empty/blocked fallbacks
- `welcome-screen.tsx`: `<main>` with `<h1>` for logotype
- Heading hierarchy: one `<h1>` per page, `<h2>` for sections, `<h3>` for sub-sections

**Pass B — ARIA and interaction on dialogs and interactive components:**
- `approval-dialog.tsx`: `aria-modal="true"`, `role="alertdialog"` for destructive risk categories, focus trap, first focus on "No, don't do this"
- `new-project-dialog.tsx`: focus trap, `aria-labelledby` linked to title, error messages with `aria-live="polite"`
- `settings-screen.tsx`: full-screen dialog requires `aria-modal="true"`, section headings use `role="heading"`
- `recovery-banner.tsx`: `role="alert"`, dismiss button has `aria-label="Dismiss recovery banner"`
- `active-run-indicator.tsx`: `aria-live="polite"` for run status text, `aria-label` on click target
- All icon-only buttons (theme toggle, settings gear, panel collapse): require `aria-label`
- All form inputs: associated `<label>`, `aria-required="true"` for required fields
- Status indicators (phase queue dots, mode badges): paired with text labels (never rely on color alone)

**Requirements applied in both passes:**
- Color contrast: WCAG AA (4.5:1 body, 3:1 large text) — verified by token values
- Keyboard: all interactive elements reachable via Tab. No keyboard traps except modal dialogs.
- Focus indicators: visible focus ring on all focusable elements (2px `--color-primary` outline, 3px offset)
- Alt text: all images have descriptive `alt`, decorative `alt=""`
- Touch targets: minimum 44×44px
- Reduced motion: `@media (prefers-reduced-motion: reduce)` suppresses animations

---

### Step 19 — Update Artifact Stage Mapping

**Files to modify:**
- `src/lib/artifact-stage-mapping.ts`

**Details:**
- Add `project_complete` mapping → renderer name: `ProjectCompleteScreen`
- Ensure all 19 state entries map to correct renderer names (preserve existing ones, no breaking changes)
- Verify `DYNAMIC_STATE_FALLBACK` entries are still correct

---

### Step 20 — Refine Hooks

**Files to modify:**
- `src/hooks/use-active-run.ts` — add `isRunning` derived state: `status === "running" || status === "queued"`

**Files to create:**
- `src/hooks/use-elapsed-time.ts` (from Step 12)
- `src/hooks/use-keyboard-shortcuts.ts` (from Step 16)

---

### Step 21 — Testing

**Files to modify:** 4 existing test files may need minor updates if their mocked imports changed paths or component names:
- `src/__tests__/command-pane.test.tsx` — update mocks if imports changed
- `src/__tests__/blocked-state-card.test.tsx` — update for redesigned component
- `src/__tests__/recovery-banner.test.tsx` — update for redesigned banner
- `src/__tests__/risk-confirmation-dialog.test.tsx` — rename to `approval-dialog.test.tsx`, update for new API

**Files to create (new tests):**

| File | Coverage |
|---|---|
| `src/__tests__/welcome-screen.test.tsx` | Two cards render, clicking opens dialog |
| `src/__tests__/new-project-dialog.test.tsx` | Multi-step flow, path validation, create/audit |
| `src/__tests__/approval-dialog.test.tsx` | Risk display, Yes/No buttons, keyboard, focus trap |
| `src/__tests__/active-run-indicator.test.tsx` | Spinner, elapsed time, auto-dispatch variant |
| `src/__tests__/project-complete-screen.test.tsx` | Completion view, phase summary, actions |
| `src/__tests__/queue-panel.test.tsx` | Tab switching, phase list, timeline, load more |
| `src/__tests__/settings-screen.test.tsx` | Sections, policy toggles, health display |

**Verification:**
- `npm test` — all tests pass (existing + new)
- `npm run build` — clean build with no errors

---

### Step 22 — Visual Acceptance Checklist

> **Note:** This checklist is verified by the user in the browser after build, not by automated tests.

Per §11, verify all criteria:

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
- [ ] All existing 35 frontend tests still pass
- [ ] Frontend build is clean
- [ ] No raw JSON visible in any primary surface under normal conditions

---

## File Change Summary

### New files (17)

| File | Step |
|---|---|
| `apps/web/src/components/welcome-screen.tsx` | 3 |
| `apps/web/src/components/new-project-dialog.tsx` | 4 |
| `apps/web/src/components/app-shell.tsx` | 2 |
| `apps/web/src/components/queue-panel.tsx` | 8 |
| `apps/web/src/components/active-run-indicator.tsx` | 12 |
| `apps/web/src/components/project-complete-screen.tsx` | 13 |
| `apps/web/src/components/approval-dialog.tsx` | 9 |
| `apps/web/src/hooks/use-elapsed-time.ts` | 12 |
| `apps/web/src/hooks/use-keyboard-shortcuts.ts` | 16 |
| `apps/web/src/__tests__/welcome-screen.test.tsx` | 21 |
| `apps/web/src/__tests__/new-project-dialog.test.tsx` | 21 |
| `apps/web/src/__tests__/approval-dialog.test.tsx` | 21 |
| `apps/web/src/__tests__/active-run-indicator.test.tsx` | 21 |
| `apps/web/src/__tests__/project-complete-screen.test.tsx` | 21 |
| `apps/web/src/__tests__/queue-panel.test.tsx` | 21 |
| `apps/web/src/__tests__/settings-screen.test.tsx` | 21 |
| `apps/web/src/components/ui/tabs.tsx` | 1 |
| `apps/web/src/components/ui/select.tsx` | 1 |
| `apps/web/src/components/ui/switch.tsx` | 1 |
| `apps/web/src/components/ui/dropdown-menu.tsx` | 1 |

### Modified files (25)

| File | Step |
|---|---|
| `apps/web/src/app/globals.css` | 0 |
| `apps/web/src/app/layout.tsx` | 0 |
| `apps/web/src/app/page.tsx` | 2 |
| `apps/web/tailwind.config.ts` | 0 |
| `apps/web/src/lib/utils.ts` | 0 |
| `apps/web/src/lib/artifact-stage-mapping.ts` | 19 |
| `apps/web/src/components/project-header.tsx` | 5 |
| `apps/web/src/components/command-pane.tsx` | 6 |
| `apps/web/src/components/artifact-panel.tsx` | 7, 15 |
| `apps/web/src/components/recovery-banner.tsx` | 11 |
| `apps/web/src/components/settings-screen.tsx` | 14 |
| `apps/web/src/components/risk-confirmation-dialog.tsx` | 9 (renamed) |
| `apps/web/src/components/ui/toast.tsx` | 17 |
| `apps/web/src/hooks/use-active-run.ts` | 20 |
| `apps/web/src/components/artifacts/scope-card.tsx` | 7, 15 |
| `apps/web/src/components/artifacts/master-plan-card.tsx` | 7 |
| `apps/web/src/components/artifacts/sharpening-notes-card.tsx` | 7 |
| `apps/web/src/components/artifacts/phase-plan-card.tsx` | 7 |
| `apps/web/src/components/artifacts/build-summary-card.tsx` | 7 |
| `apps/web/src/components/artifacts/review-findings-card.tsx` | 7 |
| `apps/web/src/components/artifacts/test-results-card.tsx` | 7 |
| `apps/web/src/components/artifacts/handoff-card.tsx` | 7 |
| `apps/web/src/components/artifacts/decision-card.tsx` | 7 |
| `apps/web/src/components/artifacts/audit-card.tsx` | 7 |
| `apps/web/src/components/artifacts/phase-queue-card.tsx` | 7 |
| `apps/web/src/components/artifacts/empty-state-card.tsx` | 7 |
| `apps/web/src/components/artifacts/blocked-state-card.tsx` | 10 |
| `apps/web/src/components/artifacts/index.ts` | 7 |

### Removed files (2)

| File | Step |
|---|---|
| `apps/web/src/components/phase-queue.tsx` | 8 |
| `apps/web/src/components/project-timeline.tsx` | 8 |

### Renamed files (1)

| File | To | Step |
|---|---|---|
| `apps/web/src/components/risk-confirmation-dialog.tsx` | `apps/web/src/components/approval-dialog.tsx` | 9 |

---

## Recommended Implementation Order

The steps are ordered so each builds on the previous:

1. **Step 0** — Design tokens + fonts (everything depends on these)
2. **Step 1** — Install shadcn components (Tabs, Select, Switch, DropdownMenu)
3. **Step 2** — Layout shell (foundation for all panels)
4. **Steps 3, 4** — Welcome screen + New Project flow (first-run UX)
5. **Step 5** — Header (shared by all states)
6. **Step 6** — Command pane (action hub)
7. **Step 7** — All 13 artifact renderers (can parallelize)
8. **Step 8** — Queue + Timeline panel (right panel)
9. **Step 9** — Approval dialog (required for risky actions)
10. **Steps 10, 11** — Blocked state + Recovery banner (error states)
11. **Steps 12, 13** — Active run indicator + Project complete (state-specific)
12. **Step 14** — Settings screen (full implementation)
13. **Step 15** — Scope editing integration
14. **Steps 16, 17, 18** — Keyboard shortcuts, Toast, Accessibility (polish)
15. **Steps 19, 20** — Mapping updates, hook refinements
16. **Step 21** — Testing (new + existing)
17. **Step 22** — Visual acceptance verification
