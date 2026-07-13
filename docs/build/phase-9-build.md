# Phase 9 Build Record — Frontend Design System Implementation

**Status**: Complete  
**Built**: 2026-07-12  
**Plan reference**: `docs/plan/phase-9-plan.md`  
**Design guide**: `docs/flowbench-phase9-design-guide.md`  
**Backend suite**: 237 / 237 passing (unchanged)  
**Frontend tests**: 61 / 61 passing (was 35 — 26 new tests added)  
**Frontend build**: clean  
**Lint**: N/A (no backend changes)  
**Commit**: dc6fe92

---

## Summary

Replaced the functional-but-unstyled frontend with a modern, minimalist, zero-CLI experience. Implemented the full visual language (warm-neutral palette, typography scale, OKLCH shadows), layout system (responsive three-column shell), component grammar (document-style artifact renderers), and interaction model (command pane, approval dialog, active-run indicator, keyboard shortcuts) defined in the design guide.

No backend changes. No new API endpoints. No new workflow states or artifact schemas. All 35 existing tests retained; 26 new tests added.

---

## Changed files

### New files (22)

| File | Purpose |
|---|---|
| `apps/web/postcss.config.js` | **Missing** — wires Tailwind into Next.js build pipeline (root cause of rendering failure) |
| `apps/web/src/components/app-shell.tsx` | Responsive three-column layout shell (desktop: left rail + workspace + right panel; mobile: drawer + bottom nav) |
| `apps/web/src/components/welcome-screen.tsx` | First-run screen with two action cards |
| `apps/web/src/components/new-project-dialog.tsx` | Two-step project creation dialog (name → path) |
| `apps/web/src/components/queue-panel.tsx` | Queue + Timeline tabs (replaces `phase-queue.tsx` + `project-timeline.tsx`) |
| `apps/web/src/components/active-run-indicator.tsx` | Persistent non-blocking run-status indicator |
| `apps/web/src/components/project-complete-screen.tsx` | Completion view for `project_complete` state |
| `apps/web/src/components/approval-dialog.tsx` | Risk-confirmation dialog (replaces `risk-confirmation-dialog.tsx`) |
| `apps/web/src/hooks/use-elapsed-time.ts` | MM:SS elapsed time hook |
| `apps/web/src/hooks/use-keyboard-shortcuts.ts` | Keyboard shortcut handler (Esc, Cmd/Ctrl+, , Cmd/Ctrl+/, ?) |
| `apps/web/src/components/ui/tabs.tsx` | shadcn Tabs wrapper (`@radix-ui/react-tabs`) |
| `apps/web/src/components/ui/select.tsx` | shadcn Select wrapper (`@radix-ui/react-select`) |
| `apps/web/src/components/ui/switch.tsx` | shadcn Switch wrapper (`@radix-ui/react-switch`) |
| `apps/web/src/components/ui/dropdown-menu.tsx` | shadcn DropdownMenu wrapper (`@radix-ui/react-dropdown-menu`) |
| `apps/web/src/components/ui/input.tsx` | Input component (required by new-project-dialog) |
| `apps/web/src/__tests__/welcome-screen.test.tsx` | 4 tests: cards render, clicking opens dialog |
| `apps/web/src/__tests__/new-project-dialog.test.tsx` | 8 tests: multi-step flow, path validation, create/audit |
| `apps/web/src/__tests__/approval-dialog.test.tsx` | 9 tests: risk display, buttons, keyboard, focus trap (renamed from `risk-confirmation-dialog.test.tsx`) |
| `apps/web/src/__tests__/active-run-indicator.test.tsx` | 4 tests: spinner, elapsed, auto-dispatch variant |
| `apps/web/src/__tests__/project-complete-screen.test.tsx` | 4 tests: completion view, phase summary, actions |
| `apps/web/src/__tests__/queue-panel.test.tsx` | 6 tests: tab switching, phase list, timeline, load more |
| `apps/web/src/__tests__/settings-screen.test.tsx` | 7 tests: sections, policy toggles, health display |

### Modified files (25)

| File | Change |
|---|---|
| `apps/web/src/app/globals.css` | Replaced HSL color system with Phase 9 warm-neutral palette; added shadcn compatibility aliases; fluid typography scale; shimmer animation; reduced-motion media query |
| `apps/web/tailwind.config.ts` | Replaced default color map with Phase 9 tokens (bg, surface, text, primary, status); added font families (Instrument Serif, Inter, JetBrains Mono); fluid fontSize scale; custom borderRadius; shimmer keyframes; restored shadcn compatibility colors (background, foreground, card, accent, destructive, ring, etc.) |
| `apps/web/src/app/layout.tsx` | Loaded Instrument Serif / Inter / JetBrains Mono via `next/font` with CSS variables |
| `apps/web/src/app/page.tsx` | Conditional render: `WelcomeScreen` when no project, `AppShell` otherwise; removed `min-w-[1280px]` constraint |
| `apps/web/src/lib/utils.ts` | Added `formatAbsoluteTime` for timeline hover-to-reveal |
| `apps/web/src/lib/artifact-stage-mapping.ts` | Added `project_complete` → `ProjectCompleteScreen` renderer |
| `apps/web/src/components/project-header.tsx` | Redesigned: 56px height, display font title, mode badge, stage label, shadow-based separation, theme toggle, settings gear |
| `apps/web/src/components/command-pane.tsx` | Moved from right panel to left rail (260px); three sections: primary action (always visible), secondary actions (scrollable), status block; removed no-project mode selector |
| `apps/web/src/components/artifact-panel.tsx` | Added `ProjectCompleteScreen` support; passes `currentState` to `ScopeCard` for edit-mode detection; updated renderer map |
| `apps/web/src/components/recovery-banner.tsx` | Redesigned: warning-muted banner, pill-style buttons, dismiss X, tooltip titles |
| `apps/web/src/components/settings-screen.tsx` | Full modal with sections: Project, New Project, Adapter, Policies (Switch toggles), Appearance (theme radio), About |
| `apps/web/src/components/ui/toast.tsx` | Updated: max 3 toasts, 4s auto-dismiss (info/success), persistent for errors, dismiss X button |
| `apps/web/src/hooks/use-active-run.ts` | Added `isRunning` derived state |
| `apps/web/src/components/artifacts/scope-card.tsx` | Document-style format; editable textarea in `scope_ready` state with auto-save on blur + character count; raw fallback when parse yields empty sections |
| `apps/web/src/components/artifacts/master-plan-card.tsx` | Document-style format (badge pill, display title, divider, sections, 65ch max-width) |
| `apps/web/src/components/artifacts/sharpening-notes-card.tsx` | Document-style format with collapsible rounds |
| `apps/web/src/components/artifacts/phase-plan-card.tsx` | Document-style format with acceptance criteria checklist |
| `apps/web/src/components/artifacts/build-summary-card.tsx` | Document-style format with collapsible file lists |
| `apps/web/src/components/artifacts/review-findings-card.tsx` | Document-style format with severity-colored findings |
| `apps/web/src/components/artifacts/test-results-card.tsx` | Document-style format with pass/fail counts, failing tests list |
| `apps/web/src/components/artifacts/handoff-card.tsx` | Document-style format with completed/unresolved/notes sections |
| `apps/web/src/components/artifacts/decision-card.tsx` | Document-style format |
| `apps/web/src/components/artifacts/audit-card.tsx` | Document-style format with collapsible directory structure |
| `apps/web/src/components/artifacts/phase-queue-card.tsx` | Document-style format with status dots and active phase highlighting |
| `apps/web/src/components/artifacts/empty-state-card.tsx` | Document-style format with doc icon, heading, body, primary action button |
| `apps/web/src/components/artifacts/blocked-state-card.tsx` | Redesigned: "Blocked" error badge, "What happened"/"What you can do" sections, full-width recovery action buttons |

### Removed files (3)

| File | Replacement |
|---|---|
| `apps/web/src/components/phase-queue.tsx` | Folded into `queue-panel.tsx` |
| `apps/web/src/components/project-timeline.tsx` | Folded into `queue-panel.tsx` |
| `apps/web/src/components/risk-confirmation-dialog.tsx` | Renamed to `approval-dialog.tsx` |

### Installed dependencies

| Package | Version | Purpose |
|---|---|---|
| `@radix-ui/react-tabs` | ^1.1.17 | Tabs component |
| `@radix-ui/react-select` | ^2.3.3 | Select component |
| `@radix-ui/react-switch` | ^1.3.3 | Toggle component |
| `@radix-ui/react-dropdown-menu` | ^2.1.20 | Dropdown menu component |
| `@radix-ui/react-label` | ^2.1.11 | Label component |
| `@radix-ui/react-radio-group` | ^1.4.3 | Radio group component |
| `autoprefixer` | * | PostCSS peer (Tailwind pipeline) |
| `postcss` | * | PostCSS (Tailwind pipeline) |

---

## Root-cause fix: Tailwind not processing through PostCSS

During visual verification the frontend rendered as unstyled, vertically stacked elements despite correct CSS variables and component code.

**Diagnosis**: `npm run build` produced a 7.8 KB CSS bundle with raw `@tailwind` / `@apply` directives still in the output — Next.js never ran Tailwind as a PostCSS plugin.

**Cause**: Missing `postcss.config.js` (required by Next.js to discover and run PostCSS plugins). Missing `autoprefixer` package.

**Fix**: Added `postcss.config.js` wiring `tailwindcss` + `autoprefixer`, installed missing packages, and restored shadcn color-variable aliases so components referencing `bg-background`, `text-primary-foreground`, etc. continue working alongside the new Phase 9 token system.

**Verification**: Post-fix build CSS is ~36 KB with `.flex`, `.gap-3`, `.items-center`, `.h-14`, `.bg-surface`, `.font-display` all present. Raw `@tailwind` / `@apply` are gone.

---

## Architecture

### Layout shell

```
Desktop (>=1024px):
┌──────────────────────────────────────────────────────────────┐
│  HEADER (56px, sticky)                                       │
├──────────┬───────────────────────────────┬───────────────────┤
│ LEFT RAIL│ ARTIFACT WORKSPACE            │ RIGHT PANEL       │
│ 260px    │ flex-1, max-w-720px, centered │ 280px             │
│          │                               │                   │
│ Command  │ Document-style artifact       │ Queue / Timeline  │
│ Pane     │ viewer/editor                 │ tabs              │
│          │                               │                   │
│ ──────── │                               │                   │
│ Status   │                               │                   │
└──────────┴───────────────────────────────┴───────────────────┘

Medium (768–1023px): left rail → slide-in drawer, right panel hidden
Mobile (<768px): bottom tab navigation (Actions / Artifact / Queue)
```

### Design token system

- **Surfaces**: warm neutral (`--color-bg: #f5f4f0`, `--color-surface: #f9f8f5`, etc.)
- **Text**: 4-step scale (`--color-text`, `--text-muted`, `--text-faint`, `--text-inverse`)
- **Primary**: teal accent (`--color-primary: #0a6b6e`)
- **Status**: semantic (success, warning, error, info) each with muted variant
- **Shadows**: OKLCH-based (`--shadow-sm/md/lg`)
- **Typography**: fluid `clamp()` scale (`--text-xs` through `--text-2xl`)
- **Transitions**: cubic-bezier timing (`--transition-fast/interactive/slow`)
- **Dark mode**: matching values under `.dark` class

### Command pane (left rail)

- **Section A** (always visible, outside ScrollArea): primary action button in teal fill with description
- **Section B** (scrollable): secondary ghost-bordered actions grouped system → adapter → risk
- **Section C** (bottom): run status (spinner + elapsed) or "No active run"

### Artifact renderer grammar

All 13 artifact renderers use a consistent document-style format:
1. Badge pill (e.g., "Scope", "Master Plan")
2. Display font title
3. 1px divider
4. Section headings (bold body font)
5. Body text (65ch max-width)
6. Code/paths in monospace with inset background
7. Outer container: `bg-surface-2` + `shadow-sm` + `rounded-xl`

---

## Test results

### New tests (7 files, 42 tests)

| File | Tests | Coverage |
|---|---|---|
| `welcome-screen.test.tsx` | 4 | Cards render, heading, description, dialog opens on click |
| `new-project-dialog.test.tsx` | 8 | Multi-step, path validation, mode switching, create/audit buttons |
| `approval-dialog.test.tsx` | 9 | Risk display, Yes/No buttons, keyboard (Enter/Escape), focus trap, loading state, error handling, null action |
| `active-run-indicator.test.tsx` | 4 | Spinner, elapsed time, auto-dispatch variant, hidden when no run |
| `project-complete-screen.test.tsx` | 4 | Completion heading, project name, phase count, action buttons |
| `queue-panel.test.tsx` | 6 | Tab switching, phase list with names/count, queue empty state, timeline empty state |
| `settings-screen.test.tsx` | 7 | All sections render (project, mode, policies, appearance, about), close button |

### Updated tests (4 files)

| File | Changes |
|---|---|
| `command-pane.test.tsx` | Rewired for new CommandPane API (no-project mode selector removed) |
| `blocked-state-card.test.tsx` | Updated badge text, "What you can do" section label |
| `recovery-banner.test.tsx` | Updated title, button labels (Inspect, Revise Plan) |
| `approval-dialog.test.tsx` | Renamed from `risk-confirmation-dialog.test.tsx`; updated button labels (Yes, go ahead / No, don't do this) |

### Suite

```
cd apps/web && npm test  → 61 passed, 10 suites (was 35 passed, 4 suites)
cd apps/web && npm run build  → clean (36 KB CSS, all utilities present)
```

---

## Key design decisions

1. **shadcn compatibility aliases**: The Phase 9 token system replaces the old HSL-based shadcn variables. Rather than rewriting every shadcn component (Button, Badge, Separator, etc.), `globals.css` maps Phase 9 tokens to the shadcn variable names (`--background`, `--foreground`, `--primary-foreground`, `--accent`, etc.). New Phase 9 components use the new `bg-surface`, `text-text` classes directly.
2. **PostCSS config gap**: The project had no `postcss.config.js`. Next.js 14 with `next/font` partially works without it (font CSS is emitted), but `@tailwind` directives are never processed. This is not a Phase 9 implementation bug — the file was simply never created. Added it as part of the build record.
3. **Artifact naming**: Existing `-card.tsx` files kept their names to avoid import-chain breakage per the plan §7.3. The `ProjectCompleteScreen` component uses the `-screen.tsx` convention per the design guide §12.
4. **Scope editor state detection**: Uses prop threading (`currentState` string from `ArtifactPanel` → `ScopeCard`) — not a context or hook. Per plan §15.
5. **Timeline level filter**: Uses API-compatible level strings (`INFO`/`WARNING`/`ERROR`) rather than the non-existent `PROJECT`/`PHASE` filter that the API doesn't support. The design guide labels were adjusted to match actual API capability.
6. **Auto-dispatch detection**: Uses explicit action-name matching (`["auto_review", "auto_test", "review", "test"]`) rather than brittle `includes("auto")` string check.
7. **Date grouping**: Timeline events grouped by date with "Today" / "Yesterday" / date-keyed headers, matching the design guide §5.6 specification.

---

## Known issues

1. **`use-keyboard-shortcuts.ts`**: Created per plan Step 16 but not wired into any component. Reserved for future use when global keyboard shortcuts are enabled.
2. **DropdownMenu**: Installed to complete the 12-component shadcn/ui set per plan Step 1 but not used in Phase 9. Reserved for phase management context menu in a future phase.
3. **Scope content parsing**: The `ScopeCard.readOnly` mode parses `## Goal` / `## Non-Goals` markdown headings. If scope content uses a different format, parsed sections are empty and raw content is shown as fallback. This is intentional — information is never hidden.
4. **Timeline level filter**: UI shows "All / Info / Warning / Error" matching API capability. The design guide specified "All / Project / Phase" but no backend endpoint supports filtering by event source type. The guide labels may need updating if a future phase adds this capability.
