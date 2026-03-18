---
name: execute-refactor-next-phase
description: Executes the next phase of the core refactor following docs/REFACTOR.md. Use when the user asks to execute/continue the next phase of the refactor, remove duplicate features, unify routes, delete unused code, or stabilize the dimensions/KPI mapping system. Always follow Verify → Migrate → Delete, prefer clean rewrites over patching when logic is tangled, avoid duplicate pathways, and run build/lint loops fixing all errors. Update docs/REFACTOR.md with progress and verification evidence.
---

# Execute refactor next phase (core refactor)

## Authority (must follow)

- Single source of truth: `docs/REFACTOR.md` governs scope, goals, phases, and “Verify → Migrate → Delete”.
- This skill never overrides that document. If anything conflicts, follow `docs/REFACTOR.md`.

## Default behavior

- Proceed autonomously; only ask questions when you cannot safely proceed without new information required by `docs/REFACTOR.md` (e.g., a mandated decision with multiple valid options).
- When unsure and the doc allows discretion, choose the most conservative safe approach:
  - Disable/retire entrypoints first.
  - Postpone irreversible DB deletes unless the doc explicitly marks them safe.

## Core refactor rules (apply throughout)

- Prefer clean rewrite over patching when modules are tangled, duplicated, or risky to patch—while keeping the repo’s architecture consistent.
- No duplicate logic: one canonical implementation per capability; migrate what’s needed into the canonical path, then remove the rest.
- Keep one clear path per feature; avoid introducing parallel wrappers/flows.
- Unify routes to the simplified structure required by the “Core routes (must remain)” contract in `docs/REFACTOR.md`.
- Never call secret-bearing APIs from the browser; keep sensitive integrations server-side.

## Workflow (run every time)

### 1) Load guardrails and pick the next phase

- Read `docs/REFACTOR.md` first.
- Determine the next phase to execute (Phase 1 → Phase 5) based on the progress tracker state in the doc.
- If the doc requires a decision and none is recorded, ask exactly once with the minimal set of options.

### 2) Plan and track with a TODO list

- Create/update a TODO list that mirrors:
  - The chosen phase’s checklist(s) in the doc
  - Concrete artifacts (files/routes/functions) to migrate/delete
- Keep only one TODO item in progress at a time.
- Mark items complete immediately when done.

### 3) Execute refactor actions (in doc order; otherwise use this order)

#### A) Remove duplicate features (Verify → Migrate → Delete)

- Identify parallel implementations (duplicate table implementations, duplicated hooks/helpers, duplicated mapping utilities).
- Choose the canonical path defined by `docs/REFACTOR.md` (dimensions loading + KPI mapping pipeline).
- Migrate any still-needed capability into the canonical path.
- Delete/retire duplicates only after the doc’s verification checklist is satisfied (routes/imports/usage/DB/shared utilities).

#### B) Rewrite messy logic (prefer small, composable modules)

- If a module is hard to reason about or patching increases risk, rewrite it while preserving the public behavior expected by the canonical path.
- Enforce a single data model per domain (e.g., one message model in chat).
- Keep business logic out of UI components; move it into server/data/integrations layers.

#### C) Unify routes

- Ensure all “Core routes (must remain)” exist and route to the correct layouts/components.
- Retire or remove legacy routes only after verification.
- Avoid duplicate route trees that provide the same user journey.

#### D) Delete unused code (after proof)

- Remove unused components/pages/contexts/services/assets/edge functions only after proving non-use per the doc’s checklist.
- For Supabase/DB cleanup: follow the doc’s protocol; avoid irreversible deletes unless explicitly safe.

### 4) Auto-run checks and fix all errors (loop until clean)

Run the minimum needed to achieve a clean state; prefer pnpm when available.

- Install (only if needed): `pnpm install`; fallback `npm ci`
- Build/typecheck: `pnpm run build` (or `npm run build`)
- Lint: `pnpm run lint` (or `npm run lint`)

If any command fails:
- Fix the underlying issue (code/config/types/routes).
- Re-run the failing command.
- Do not stop until build + lint pass.

### 5) Document everything in `docs/REFACTOR.md`

Update it as the living log:

- Update the progress tracker checkboxes for what was completed.
- For each removed/migrated module, include a filled copy of the doc’s “Used in current stack?” verification checklist (or link to the evidence via code search results).
- Under the relevant phase section, add a short “What changed” note:
  - What was deleted/migrated
  - What replaced it (canonical path)
  - How it was verified
  - What commands were run and their final outcome

## Output to report back to the user (end of run)

- Phase executed and key TODOs completed
- Route changes (added/removed/redirected)
- Duplicate removals (migrated vs deleted)
- Checks run and final status (build/lint)
