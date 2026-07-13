# FlowBench — Phase 11 Plan: Onboarding & Settings Hardening (V1 Closure)

> **Authoritative scope source:** `docs/FlowBench Product Scope v2.0.md` (§10 V1 Feature Scope, §13 V1 Success Criteria)
> **No scope creep.** Every change below is required to make the already-shipped V1 feature set actually usable by the stated target user (a non-technical hobbyist who "has never opened a terminal"). Nothing from the §10 "Explicitly Excluded" list is added.
>
> **API-surface note (accurate):** This plan **adds two small, bounded configuration endpoints** — `GET /api/v1/policies` and `POST /api/v1/policies` — for truthful Settings controls. It adds **no workflow actions, no workflow states, and no artifact types**. All workflow behavior (state graph, guards, artifact schemas, `.flowbench` layout) is preserved unchanged.

---

## 1. First-principles framing

FlowBench's entire reason to exist is stated in one sentence in the scope (§1, §13): *take a written scope → master plan → phase loop*. The scope artifact is **the seed input** and the project display name is the human-facing identity of the work. If a user cannot cleanly enter their idea at onboarding, the product fails its single most important job before any loop runs.

Separately, FlowBench is explicitly *a console that sits above an execution backend* (§8). It does **not** own model routing (§10 "Built-in model routing — Belongs to the execution adapter"). That means a real install has a hard external dependency: the OpenCode CLI must be installed **and** configured with a default model. Today the README and prerequisite checker pretend this dependency does not exist, so a user following the documented happy path reaches a silent adapter failure. That is a V1 onboarding defect, not a feature gap.

Both classes of problem are **blockers to the V1 success criteria** in §13 ("A hobbyist builder who has never opened a terminal can … follow the README to start a project"). They are therefore in-scope to fix now.

### Evidence (current broken behavior)

| # | Finding | Location |
|---|---|---|
| E1 | New-build onboarding sends the **project name** as the scope content (`scope_content: projectName`) | `apps/web/src/components/new-project-dialog.tsx:97` |
| E2 | The actual app idea is **never collected** at project creation for either mode | `new-project-dialog.tsx` (only collects name + repo path) |
| E3 | `project_display_name` typed by the user is **discarded**; boot state hardcodes `"My Project"` | `services/orchestrator/api/actions.py:129`, `:154` |
| E4 | Existing-app flow produces an audit but leaves **scope empty**; `generate_master_plan` is disabled by the `scope_has_content` guard with no guided prompt to write one | `config/workflows.json:46` guard `scope_has_content`; `engine/guards.py:1` |
| E5 | README never mentions installing OpenCode or configuring a model; `prereq-check.sh` only checks `uv`/`pnpm` | `README.md`, `scripts/prereq-check.sh:18-28` |
| E6 | Settings "Backend — Connected" is a **static label**; the health dot only pings FlowBench's own `/health`, never the `opencode` binary | `apps/web/src/components/settings-screen.tsx:130-137`, `main.py:55-57` |
| E7 | Settings policy toggles are **hardcoded** and local-only; toggling changes nothing and is not persisted | `settings-screen.tsx:25-41`, `config/policies.json` |
| E8 | Settings "Change" repo-path button has **no handler** (dead control) | `settings-screen.tsx:93` |
| E9 | Settings **Name** input is editable but **not persisted** (second dead control) | `settings-screen.tsx:75-82` |

The backend already supports persisting scope: `start_new_project` writes `scope.json` from `body.scope_content` (`actions.py:312-318`) and `edit_scope` rewrites it (`:319-330`). So the fix is mostly **frontend** plus small, contained backend additions.

---

## 2. Work Item 1 — Collect the real scope at new-build onboarding (fixes E1, E2, E3)

### Problem
The new-project dialog collects a display name and a repo path, then misuses the name as the scope seed. The builder's actual idea is lost. `project_display_name` is also dropped, so the header always reads "My Project".

### Principle
The scope artifact is the product's seed input; the display name is project identity. Both are collected once, at onboarding, and persisted. No new concepts, no new states. For **new build** the scope is the natural first input and is collected up front. (Existing-app scope timing is deliberately different — see Item 2.)

### Approach

**Frontend — `apps/web/src/components/new-project-dialog.tsx`**
- Keep the `projectName` field but treat it strictly as the **display name** (binding unchanged; it feeds `project_display_name`).
- Show the **scope textarea only for `new_build`** (audit-first flow for existing app is preserved per Item 2, so existing-app does not collect scope here):
  - Step 1 (name + mode) stays as-is.
  - Step 2 (repo path): for `new_build`, add a scope textarea labelled "Describe the app you want to build — what it should do, who it's for, and anything it should *not* do." Validation: Create is disabled until scope is non-empty after `.strip()`. Helper text: "A short paragraph is enough to start — you can refine it next."
  - For `existing_app`, Step 2 is unchanged (repo path + read-only audit warning). Scope is entered later (Item 2).
- Update the submit payload (`handleCreate`, `:93-107`):
  - `new_build` → `postAction("start_new_project", { project_display_name: projectName, scope_content: scope })`
  - `existing_app` → `postAction("load_existing_project", { project_display_name: projectName })` — **no** `scope_content` (audit runs first).
  - For `existing_app`, while the audit runs (up to 120s), the dialog must show a read-only progress label such as **"Auditing your repository — read-only, this can take a minute or two"** instead of a bare "Start Audit…". (Audit wait/failure handling detailed in Item 2, sub-item 2c.)

**Frontend — `apps/web/src/lib/api.ts`**
- Extend `ActionRequestBody` (`:30-33`) with `project_display_name?: string`.

**Backend — `services/orchestrator/api/actions.py`**
- `ActionRequest` (`:99-102`): add `project_display_name: Optional[str] = None`.
- `start_new_project` boot state (`:127-137`): set `project_display_name = body.project_display_name or "My Project"` instead of the hardcoded `"My Project"`.
  - `load_existing_project` boot state (`:153-162`): set `project_display_name = body.project_display_name or "My Project"`. (No scope write here — existing-app scope is authored after the audit, per Item 2.)
  - Ensure an audit failure/timeout from `load_existing_project` returns `status: "error"` (or a dedicated `audit_failed` status the dialog handles) so the dialog stays open and surfaces a plain-English error, rather than closing on an unrecognized response. (See Item 2, sub-item 2c.)
- The existing `start_new_project` scope write at `:312-318` already persists `body.scope_content` — keep it; it now receives the real idea.

### Notes / non-goals
- We do **not** change the phase/project state graph, guards, or artifact schemas. `SchemaVersion` on `ScopeArtifact` is unchanged.
- We do **not** add a separate "rename project" feature. The name is set once at onboarding; later rename is out of V1 scope (deferred — see Item 4d).

### Success criteria
- New build: header shows the typed name; `scope.json` contains the idea (not the name); `scope_ready` shows the idea in the editable ScopeCard; `Generate master plan` is enabled.
- Existing app: dialog unchanged except the typed name is persisted; audit still runs read-only first.

### Tests
- `apps/web/src/__tests__/new-project-dialog.test.tsx`: assert new-build payload contains `project_display_name` + real `scope_content`; assert existing-app payload contains `project_display_name` and **no** `scope_content`; assert Create disabled until scope non-empty (new build only).
- Backend: extend `tests/test_api.py` `test_start_new_project_system_action` to assert `current-state.json` `project_display_name` equals the sent value and `scope.json.content` equals the sent scope (not the name).

---

## 3. Work Item 2 — Audit-first, then guided scope entry for existing-app mode (fixes E4)

### Problem
After the audit, the user is in `scope_ready` with no scope and no prompt telling them to write what they want to improve. The `generate_master_plan` action is correctly disabled, but the UI gives no direction, which is confusing for a non-technical user.

### Principle
Per the product scope (§7) and the existing-app UX spec, the sequence is **audit baseline first, then a scope for the improvement or refactor**. FlowBench must always make the next valid step obvious (scope §3 "Process Before Autonomy", §6). An empty required input must surface a clear, plain-English prompt and open the editor — not just leave a disabled button.

### Approach (audit-first; scope entered after the audit returns)

1. **Keep the existing-app dialog audit-first.** No scope is collected before the audit (Item 1 enforces this). `load_existing_project` runs the read-only audit and writes `audit.json`, then transitions to `scope_ready` with empty scope.

2. **Author the first scope via a blank `ScopeCard` editor (fixes the empty-scope dead end).** The current `ScopeCard` does `if (!data) return null` (`scope-card.tsx:15`), and the artifact panel falls through to a **blank** render for `scope_ready` with no `scope.json` (it does *not* fall back to `EmptyStateCard`). The existing "Edit scope" command-pane button posts `edit_scope` with no body, which keeps the empty scope. So the builder currently has **no way to author the first scope**. Fix:
   - Change `ScopeCard` so that when `currentState === "scope_ready"` and `scope.json` is missing/empty, it renders a **blank textarea editor** (instead of returning `null`). The artifact-stage mapping already points `scope_ready` at `ScopeCard` (`artifact-stage-mapping.ts:17-23`), so no mapping change is needed; only the `ScopeCard` guard is relaxed for the editing case.
   - On blur, post `edit_scope` with the typed content to **create** `scope.json`. (Reuses the existing `ScopeCard` editor `onBlur` + `edit_scope` path, no new action.)
   - **Safeguard (required):** do **not** send `edit_scope` for whitespace-only content. If the save (`postAction`) fails, **preserve the typed text** in the editor, show a plain-English error (e.g. "Couldn't save your scope — your text is kept below. Try again."), and keep `Generate master plan` disabled (the `scope_has_content` guard already enforces this). This prevents the editor from creating an empty artifact or discarding the user's first scope draft.
   - Update the `scope_ready` mapping copy (`artifact-stage-mapping.ts:21-22`) so its `emptyMessage` / `suggestedAction` reads plainly: **"Write what you want to build or improve below, then generate the plan."** (The inline editor is the surface; the copy just points at it.)

3. **Command-pane guidance.** In `scope_ready` with empty scope, keep `Edit scope` and `Generate master plan` visible; `Generate master plan` stays disabled via the `scope_has_content` guard until the builder writes a non-empty brief. No guard change required. (Note: because the inline `ScopeCard` editor now handles first-authoring, the "Edit scope" button is a secondary path; the primary path is typing directly in the panel.)

4. **Sub-item 2c — Audit wait + failure handling (existing-app).** `load_existing_project` runs a real adapter audit (timeout 120s, `config/adapters/opencode.json`). Two coordinated fixes:
   - **Frontend (dialog):** while the audit runs, the dialog must show a read-only progress label such as **"Auditing your repository — read-only, this can take a minute or two"** instead of a bare "Start Audit…", so the builder understands the wait.
   - **Backend:** ensure an audit failure or timeout returns `status: "error"` (or a dedicated `audit_failed` status the dialog explicitly handles) so the dialog stays open and surfaces a plain-English error, rather than closing on an unrecognized response and stranding the user. The existing `audit_failed` → `project_blocked` transition (`workflows.json`) remains the underlying state outcome; this item only governs the **response contract** the dialog relies on.

### Notes / non-goals
- The audit is read-only and independent of scope (scope §7). Scope is the *improvement* brief, authored by the human after seeing the baseline.
- We deliberately do **not** collect scope before the audit (that would contradict the existing-app spec and the product-flow description). This is a deliberate product decision aligned with the authoritative docs, not an implementation shortcut.
- No new API. Reuses `edit_scope` + existing empty-state rendering.

### Success criteria
- Existing-app happy path: dialog → audit (read-only) → returns to `scope_ready` with the ScopeCard editor open (or an empty-state prompting the builder to write the improvement) → builder writes scope → `Generate master plan` becomes enabled.
- Edge path: if `scope.json` is empty in `scope_ready` after refresh, the artifact panel shows the plain-English prompt and `Generate master plan` remains disabled until scope is written.

### Tests
- `apps/web/src/__tests__/scope-card.test.tsx` (add): assert `ScopeCard` renders a **blank textarea editor** when `currentState === "scope_ready"` and `scope.json` is missing/empty (does not return null).
- `scope-card.test.tsx` (extend): **successful blur-save path** — typing a non-whitespace brief and blurring calls `edit_scope` with that content (creating `scope.json`).
- `scope-card.test.tsx` (extend): **failed-save path** — when the `edit_scope` save rejects, the typed text is preserved in the editor, a plain-English error is shown, and `Generate master plan` stays disabled.
- `scope-card.test.tsx` (extend): **safeguard** — blurring with whitespace-only content does **not** call `edit_scope` (no empty artifact created).
- `apps/web/src/__tests__/new-project-dialog.test.tsx` (extend): assert the existing-app dialog shows the read-only "Auditing your repository…" progress label while `load_existing_project` is in flight.
- Backend: add a test that an `load_existing_project` audit failure/timeout returns `status: "error"` (or `audit_failed`) rather than an unrecognized status, so the dialog can surface it.
- Backend golden path (`tests/test_golden_paths.py` existing-app) continues to post `scope_content` via `edit_scope` after the audit; confirm the flow still passes.

---

## 4. Work Item 3 — Real OpenCode + model setup in README and prereq check (fixes E5)

### Problem
FlowBench cannot function without the OpenCode CLI installed **and** configured with a default model. The README omits this entirely and `prereq-check.sh` never verifies it, so a first-time user hits silent `opencode run` failures (documented only in `docs/build/phase-10-build.md:143`, which users never read).

### Principle
A tool whose success criterion is "a non-technical user can follow the README to start a project" must make its hard external dependencies explicit and verifiable at install time.

### Approach

**README.md**
- Add a top-level **"Before you start"** section (before Quick start) stating plainly:
  - FlowBench orchestrates an AI coding backend. It needs **OpenCode** installed and configured with a model.
  - Install OpenCode (one line, e.g. the official install command / `brew` / `go install`), linking to `https://opencode.ai`.
  - Create `~/.config/opencode/opencode.json` with a default model. Provide a **clearly-labelled illustrative** example (not asserted to be the authoritative schema):
    ```json
    {
      "models": {
        "default": { "provider": "<provider>", "model": "<model-id>" }
      }
    }
    ```
    and a one-line note: *"This is illustrative — see OpenCode's docs for the exact config schema."* Link to OpenCode's configuration docs. Explicitly state: *"FlowBench does not pick the model — OpenCode does. Set it once here."*
  - Note that model choice is OpenCode's responsibility, not FlowBench's (restates scope §8/§10 without jargon).
- Keep the existing Quick start (`pip install -e .`, `flowbench start`) but move it *after* the prerequisite section.

**scripts/prereq-check.sh**
- Add an OpenCode section after the frontend toolchain check (`:26-28`):
  - `check command -v opencode` (or `opencode --version`). **Hard fail** if missing, printing the install command + the README section.
  - Optionally verify the default-model config exists: `check test -f "$HOME/.config/opencode/opencode.json"`. If the binary exists but the config is missing, print a **non-fatal warning with the exact fix** — but word it honestly: OpenCode is installed, yet *"no default model config was found at ~/.config/opencode/opencode.json. Configure a model there or via another OpenCode-supported method (see OpenCode docs)."* Do **not** promise that creating this one file is necessarily sufficient (model config can be supplied through more than one OpenCode-supported mechanism). Keep this warning non-fatal to avoid over-strictness.
- Update the failure block (`:33-39`) install hints to include the OpenCode install line.

### Notes / non-goals
- We do **not** add model selection UI to FlowBench (explicitly excluded, scope §10).
- We do **not** change the adapter invocation (`adapters/opencode.py` keeps `opencode run <prompt>` with no `--model` flag — correct by design).
- We do **not** create a new `docs/setup.md`; README is the single onboarding doc per scope §12.

### Success criteria
- A user who installs per the README reaches a working `opencode run` on first adapter action.
- `scripts/prereq-check.sh` fails loudly (with the fix) if `opencode` is absent, and warns (with the fix, without over-promising) if no default model config is present.

### Tests
- Manual: on a clean shell, run `bash scripts/prereq-check.sh` with `opencode` absent → assert non-zero exit and the OpenCode install hint.
- Manual: with `opencode` present but no `~/.config/opencode/opencode.json` → assert warning printed (honest wording), exit 0.
- README: an eyeball check that the "Before you start" section exists and the JSON snippet is valid.

---

## 5. Work Item 4 — Honest Settings screen (fixes E6, E7, E8, E9)

### Problem
The Settings screen presents controls that are misleading or dead: a fake "Backend Connected" indicator, policy toggles that do nothing, a repo-path "Change" button with no handler, and an editable project-Name input that is never saved.

### Principle
A control panel must never report a state it does not verify, and must never expose a control that does nothing. For V1, the honest options are: wire it for real, or remove/hide it. We choose the minimal real wiring that matches scope §10 ("Settings screen — … adapter selection, policies") and make the remaining identity field read-only (renaming is out of scope).

### Sub-item 4a — Honest adapter availability (fixes E6)

**Backend — `services/orchestrator/main.py` (`/health`, `:55-57`)**
- Extend the response to report whether the OpenCode CLI is discoverable on `PATH`:
  ```python
  import shutil
  @app.get("/health")
  async def health():
      adapter_found = shutil.which("opencode") is not None
      return {
          "status": "ok",
          "version": "0.1.0",
          "adapter": {
              "name": "opencode",
              "available": adapter_found,
              "detail": None if adapter_found else "OpenCode CLI not found on PATH",
          },
      }
  ```
- This is a pure read, no I/O beyond `shutil.which`, no new endpoint, no state change. Bounded and safe. It proves only **presence on PATH**, not model configuration — the label must say so.

**Frontend — `apps/web/src/components/settings-screen.tsx` (`:128-138`)**
- Replace the static "OpenCode — Connected" block. After `fetchHealth()`, read `health.adapter`:
  - `available` true → neutral/green indicator labelled **"OpenCode available"** (or "OpenCode found on this computer"). **Not** "Connected" / "Ready" / "Configured" — PATH discovery does not establish model readiness.
  - `available` false → warning indicator labelled **"OpenCode not found"** with copy: "Install OpenCode and configure a model — see the README 'Before you start' section." (Honest: does not promise that configuring a model alone is sufficient.)

### Sub-item 4b — Wire policy toggles to the backend (fixes E7)

**Backend — two bounded config endpoints (new, but no workflow changes)**
- `GET /api/v1/policies` → returns the `risk_categories` map from `config/policies.json`, normalized to a list: `{ key, label, description, requires_confirmation }`.
- `POST /api/v1/policies` (body: `{ key, requires_confirmation }`) → updates the matching category's `requires_confirmation` in `config/policies.json` and returns the updated list.

**Policy persistence ownership — explicit, separate from project storage.**
`config/policies.json` is **application-level configuration**, not a project artifact. The V1 FileStore safety boundary is deliberately limited to the selected repository's `.flowbench/` directory (scope §8, safety constraints). Persisting policies through the project `FileStore` would violate that boundary. Therefore policies use a **small, separate application-config store** with the same atomic-write guarantees the rest of the system relies on:
  - New module `services/orchestrator/store/app_config.py` exposing `read_app_config(name)` / `write_app_config(name, data)`.
  - `write_app_config` performs: write to a temp file → `os.fsync()` → `os.rename()` into place (identical semantics to `FileStore`, but targeting FlowBench's **install `config/`**, not `.flowbench/`).
  - **Config location (pinned):** `app_config` resolves its base the same way `policies.py` does today — `Path(__file__).resolve().parents[3] / "config"` (FlowBench install root). This is deliberately outside `.flowbench/`. Document that policy edits require a **writable install** (true for `pip install -e .`).
  - **Overridable base path (for test isolation):** both `policies.py` (`load_policies`) and `app_config` must accept an overridable base path — an env var (e.g. `FLOWBENCH_CONFIG_DIR`) or a module-level global — defaulting to the install `config/`. Tests set it to a temp dir and clean up, so the committed `config/policies.json` is never mutated and tests stay independent.
  - This keeps project artifact storage untouched while giving global policy config durable, crash-safe writes.

**Per-request policy reads (required for runtime toggles).** `load_policies()` in `policies.py` is currently decorated with `@cache` (`:6`), so a runtime edit to `policies.json` is **never re-read until the process restarts** — which would make the 4b behavior test and real in-session toggles fail. **Remove the `@cache` decorator** (a JSON read per request is cheap) so `requires_confirmation()` / `get_risk_explanation()` consult the persisted file on every request. No other engine change is needed; the approval gate already calls `requires_confirmation()` per request (`actions.py:184`, `action_service.py:88`).

**Frontend — `settings-screen.tsx` (`:25-41`, `:142-164`)**
- Load categories from `GET /api/v1/policies` into `policyToggles` (keyed by `requires_confirmation`), replacing the hardcoded `RISK_CATEGORIES` list (still usable as a fallback label source if needed).
- On toggle, `POST /api/v1/policies` and update local state from the response. Show a transient toast on save.

**Behavioral correctness test (required).** A changed `requires_confirmation` must alter the backend approval decision on the next relevant action — not merely re-render in Settings. Add a backend test:
  - `POST /api/v1/policies` to set e.g. `modify_files.requires_confirmation = false`.
  - Issue an unconfirmed `start_building` (risk_category `modify_files`) on a project in `phase_ready_to_build` and assert the response is **not** `needs_approval` (it dispatches).
  - Reset to `true` and assert the same unconfirmed action now returns `needs_approval`.
  This proves the persisted policy is consulted by the approval authority on a fresh request.

### Sub-item 4c — Remove the dead repo-path "Change" button (fixes E8)

**Frontend — `settings-screen.tsx` (`:89-95`)**
- The repo path is fixed at onboarding and FlowBench state lives in that repo's `.flowbench/` (scope §8, artifact-layout rules). There is **no V1 "move project" feature**, and adding one (copy/move `.flowbench`, re-point state, symlink resolution) would be scope creep and risky. Switching repositories is explicitly equivalent to starting a new project.
- Remove the non-functional "Change" button. Render the repo path as read-only text only (already the case), with a one-line note: "Set when you create the project." No handler, no dead control.

### Sub-item 4d — Make the project Name field read-only (fixes E9)

**Frontend — `settings-screen.tsx` (`:74-82`)**
- The editable Name `<Input>` is currently non-persistent (E9) — a second dead control, which violates the same "wire it or remove it" principle as 4c. Project rename is out of V1 scope (deferred with Item 1's non-goal).
- Replace the editable input with **read-only plain text** showing `state.project_display_name` (the value now correctly persisted at onboarding by Item 1). No handler, no false affordance.

### Notes / non-goals (Settings)
- We do **not** implement adapter switching UI beyond what exists; only OpenCode is configured (scope V1). The "Adapter" section shows real availability from 4a.
- We do **not** add project rename/move (4c, 4d non-goals).
- Added surface: exactly two config endpoints (`GET`/`POST /api/v1/policies`); no workflow actions/states/artifacts.

### Success criteria
- Settings adapter indicator reflects whether `opencode` is actually on PATH; label is "OpenCode available" (found) / "OpenCode not found" (absent) — never "Connected"/"Ready".
- Policy toggles load from and persist to `config/policies.json` via the separate app-config store; a toggled `requires_confirmation` demonstrably changes the backend approval decision on the next action (proven by the behavior test).
- No dead "Change" button; repo path is clearly read-only with a "set at creation" note.
- Project name is read-only plain text sourced from onboarding; no non-persistent input.

### Tests
- Backend: `tests/test_api.py` — `GET /api/v1/policies` returns the categories; `POST /api/v1/policies` flips `requires_confirmation` and persists via the app-config store. **Tests set the overridable config base path to a temp dir** (Q3) so the committed `config/policies.json` is never mutated; assert the temp file contents after write.
- Backend: approval behavior test (4b) proving a flipped `requires_confirmation` changes `needs_approval` vs dispatch on a fresh request. This is valid **only because `@cache` was removed** from `load_policies()` (the persisted value is re-read per request).
- Backend: `/health` returns `adapter.available` boolean reflecting `shutil.which`.
- Frontend: `settings-screen.test.tsx` — assert policy toggles call `POST /api/v1/policies`; assert no "Change" button rendered; assert project name renders as read-only text (no editable input); assert adapter indicator uses `health.adapter.available` and the label "OpenCode available"/"OpenCode not found".

---

## 6. Cross-cutting verification (definition of done)

1. `pytest` — all backend tests pass, including extended `test_api.py`, `test_golden_paths.py`, and the new policy behavior + app-config persistence tests.
2. `ruff check .` — clean.
3. `pnpm --prefix apps/web test` (or `npm test`) — frontend tests pass, including `new-project-dialog`, `settings-screen`, `empty-state-card`, `scope-card`.
4. `bash scripts/prereq-check.sh` — passes on a machine with OpenCode + model config; fails with the fix hint when OpenCode is absent.
5. Manual smoke (per `scripts/smoke-test.sh`): from a clean README walkthrough, a first-time user can (a) install OpenCode + model, (b) create a new build with a real scope, (c) create an existing-app project where the audit runs first and the improvement scope is then guided/prompted, (d) reach `Generate master plan` without manual rediscovery of the scope field.
6. **No change** to `config/workflows.json`, state graph, guards, or artifact schemas (V1 contract preserved). `docs/workflow-contract.json` remains authoritative and unaffected. The only API additions are the two bounded `policies` config endpoints.

---

## 7. Out of scope (explicit non-goals for Phase 11)

- Model/provider selection UI inside FlowBench (scope §10 excluded).
- Multi-project support, project rename/move, adapter switching beyond OpenCode.
- Per-project policy configuration; code viewer/diff; chat interface; timelines-as-separate-screen (timeline already ships as a QueuePanel tab).
- Any new artifact types, states, or actions.

## 8. Tightened decisions

| Decision | Recommended resolution | Why |
|---|---|---|
| D1: Policy toggles | Keep real `GET`/`POST` wiring, persisted via a **separate app-config store** (atomic temp-write/fsync/rename) targeting FlowBench's install `config/` (outside `.flowbench`); **`@cache` removed** from `load_policies()` so runtime edits apply per request; tests use an **overridable config base path** (temp dir) for isolation; plus an API-level behavior test proving the changed `requires_confirmation` alters the next approval decision | Settings needs truthful controls; the workflow contract makes policy configuration part of the backend approval authority, and the test proves it is actually consulted on a fresh request. |
| D2: Scope timing (existing app) | **Audit first**, then require and guide scope entry immediately after the audit returns; the first scope is authored via an **inline blank `ScopeCard` editor** (relaxes the `!data` guard) that posts `edit_scope` on blur, with the safeguard that whitespace-only saves are rejected, failed saves preserve the draft + show an error, and `Generate master plan` stays disabled | Preserves the existing-app UX spec and product-flow description (§7) while eliminating the empty-scope dead end without creating empty artifacts or discarding the user's draft. |
| Adapter status label | **"OpenCode available"** (found on PATH) / **"OpenCode not found"** — never "Connected"/"Ready"/"Configured" | `PATH` discovery proves CLI presence only, not model readiness. |
| Settings name | **Read-only** project name (plain text from onboarding) | An editable field that does not save is another dead control; rename is out of V1 scope. |
| Repo-path Change | **Removed** | Repo is the V1 project boundary; switching repos == starting a new project (out of scope). |

## 9. OpenCode feedback summary (applied)

- **Keep:** display-name/scope separation; reuse of existing scope artifact + `edit_scope`; removal of the repo-path Change button; bounded adapter availability check; focused frontend/backend regression tests.
- **Changed:** existing-app is audit-first then guided scope entry; adapter status labelled by PATH presence (not "connected"); Settings name read-only; plan language now acknowledges the two new `policies` endpoints.
- **Added:** explicit separate app-config persistence mechanism for writable global policies, plus a test proving a changed `requires_confirmation` alters backend confirmation behavior.
- **Constraints respected:** no workflow-graph, workflow-action, artifact-schema, project-storage-layout, or model-routing changes; no project rename/move.
