---
name: project-doc-planner
description: Use this skill when working on this codebase to avoid duplicate systems, keep documentation updated, and maintain a single source of truth in README.md and TODO.md. Apply when planning features, refactoring, adding routes, creating components, or any task that touches architecture, data flow, or existing systems.
---

# Project Doc Planner

## Goal

Work in a structured way. Always check existing systems before building anything new. Avoid duplicate routes, duplicate logic, duplicate components, and duplicate documentation.

## Source of truth files

- `README.md` — project overview, architecture, systems, decisions, conventions, known issues
- `TODO.md` — active tasks, next steps, backlog, verification checklist

## Required workflow

Follow this order every time:

1. Read `README.md`
2. Read `TODO.md`
3. Inspect relevant files and existing routes/components/modules before proposing changes
4. Identify whether the requested work already exists partially or fully
5. Create or update a short plan before coding
6. Prefer extending or refactoring existing systems over creating duplicates
7. After implementation, update:
   - `README.md` if architecture, system behavior, conventions, or decisions changed
   - `TODO.md` with completed items, remaining work, and next steps
8. Verify the result: build, lint, obvious runtime issues, impacted routes/components/flows

## Rules

- Do not create duplicate systems if one already exists
- Do not create a new route if an existing route can be reused or unified
- Do not create duplicate helpers, hooks, services, schemas, or state stores
- Prefer one shared source of truth for data mapping, API handling, and UI state
- If code is duplicated, propose consolidation
- If a feature is unclear, inspect current implementation before changing anything
- Keep changes small, traceable, and documented

## Documentation standard

**README.md** — include only useful long-lived information:
- system overview
- route map
- module responsibilities
- key decisions and conventions
- known tech debt
- current architecture notes

**TODO.md** — include:
- done
- in progress
- next
- blockers
- verification notes

## Output format before coding

Always start with:

### Findings
- what already exists
- what may be duplicated
- what should be reused

### Plan
- step 1
- step 2
- step 3

### Docs to update
- README.md
- TODO.md

Then proceed to implementation.

## Output format after coding

Always end with:

### Completed
- list of changes made

### Reused / unified
- list of existing systems reused
- duplicates removed or avoided

### Docs updated
- what was added or changed in README.md
- what was added or changed in TODO.md

### Verification
- build status
- lint status
- manual checks performed

## Priority

Correctness and consistency over speed. Reuse and unification over adding new files. Documentation must stay aligned with the real system.
