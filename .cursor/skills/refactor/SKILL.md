---
name: refactor
description: Execute refactor phases using README.md as the single source of truth for architecture and refactor rules. Removes duplication, unifies systems, cleans architecture, and ensures stability through Verify → Migrate → Delete workflow. Use when the user asks to refactor, execute a refactor phase, remove duplicates, unify routes, or clean architecture.
---

# Refactor Executor

## Authority (must follow)

- `README.md` → architecture, refactor rules, runbooks, duplicate mapping
- `TODO.md` → execution tracking

If conflict exists → follow `README.md`

---

## Default Behavior

- Execute autonomously
- Ask only if:
  - required decision is missing
  - action is unsafe without clarification

- Always choose safest reversible action

---

## Core Principles

- One system per feature
- No duplicate logic
- Prefer rewrite over patch when needed
- Do not introduce parallel systems
- Keep architecture consistent

---

## Mandatory Workflow

### 1. Load Context

- Read:
  - `README.md`
  - `TODO.md`

- Identify:
  - next concrete tasks in `TODO.md`
  - any architecture gaps described in `README.md` (Refactor process / Runbooks)

---

### 2. Plan (update TODO.md)

- Create/update TODO list
- Map tasks to:
  - files
  - routes
  - functions

- Rules:
  - only ONE task in progress
  - mark complete immediately

---

### 3. Execute (strict order)

#### A. Remove duplicates

- detect duplicate:
  - routes
  - services
  - components
  - APIs

- keep canonical version
- migrate logic
- delete others

---

#### B. Rewrite messy logic

- rewrite if:
  - hard to maintain
  - duplicated
  - risky to patch

- preserve behavior

---

#### C. Unify routes

- align with README.md
- remove legacy routes after verification
- ensure single entry per feature

---

#### D. Delete unused code

- remove:
  - unused files
  - dead imports
  - orphan logic

- only after verification

---

### 4. Verify Loop (until clean)

Run:

- `pnpm install` (or `npm ci`)
- `pnpm run build`
- `pnpm run lint`

If error:
- fix
- re-run
- repeat until clean

---

### 5. Document

Update:

#### README.md

- refactor / architecture sections if behavior or canonical paths changed

#### TODO.md

- completed tasks
- next tasks
- blockers

---

## Safety Rules

- never delete before verification
- never create duplicate pathways
- never break core system
- avoid irreversible actions unless safe

---

## Output

Return:

- phase executed
- tasks completed
- duplicates removed
- route changes
- build + lint status
- next step
