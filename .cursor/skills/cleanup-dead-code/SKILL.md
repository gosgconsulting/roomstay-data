---
name: cleanup-dead-code
description: Finds and removes unused files, exports, imports, components, and npm dependencies; avoids duplicate modules. Use after shipping a feature or refactor, or when the user asks to clean dead code, remove unused files, shrink the bundle, or run Knip (or equivalent unused-code analysis).
---

# Cleanup dead code

## Objective

Keep the codebase minimal. Do not accumulate unused files, exports, or duplicate UI.

## Before creating any new file

1. Search for an existing module, component, or pattern that can be reused or extended.
2. Prefer editing existing files over adding parallel implementations.
3. Never add a second component that does the same job as an existing one.

## After implementing a feature (or on request)

1. **Unused files**: List candidates; confirm zero references (imports, dynamic imports, config entry points, routes, tests, scripts, `public/` links) via full-project search before deleting.
2. **Unused code in kept files**: Remove unused imports, unused exports, unreachable branches, and dead props—do not leave large blocks commented out.
3. **Dependencies**: Remove packages that nothing imports; align with lockfile after edits.

## Deletion rules

- Delete only when there is **no** reference anywhere in the repo (including string-based paths, lazy routes, and build config).
- If reference status is ambiguous (runtime-only, codegen, framework magic), **do not delete**—list as **candidate for deletion** with reason and what to verify.
- Do not "fix" unused UI by hiding it with CSS; remove the UI and its wiring if it is truly dead.

## Tooling

Run the project's dead-code workflow when available. If none exists, use an equivalent analysis (e.g. [Knip](https://github.com/webpro/knip), `eslint` unused rules, TypeScript-aware unused export checks) and fix reported issues that are safe to remove—still verify dynamic usage manually.

- Remove unused exports and unused dependencies reported by the tool after confirming they are not used indirectly.
- Re-run the scan until clean or only justified exceptions remain.

## Refactoring priority

1. Extend or consolidate into existing files.
2. Delete obsolete files once unreferenced.
3. Never duplicate logic across files when a shared module already exists or should exist.

## Output format (required)

Report in this structure:

```markdown
## Deleted files
- `path` — brief reason

## Cleaned files
- `path` — what was removed (e.g. unused import, dead export)

## Remaining candidates
- `path` — why uncertain; what check would confirm safe removal
```

## Strict behavior

- Do not leave unused code commented out as a substitute for deletion.
- Do not hide unused UI with CSS instead of removing it.
- Do not duplicate logic across files when one source of truth is enough.
