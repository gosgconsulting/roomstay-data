# Roomstay Design System (UI rules)

Minimalist, premium SaaS UI with strict color discipline. This is the single source of truth for how we style UI in Roomstay.

## Non-negotiable principles

- **Minimal, quiet UI**: reduce borders, reduce shadows, reduce gradients.
- **Hierarchy over color**: use spacing, typography, and density first.
- **Color only for meaning**:
  - **Primary** (`#FF0068`): primary action only — CTA buttons, active tab indicator
  - **Success / Warning / Destructive**: status only
  - Everything else should be neutral surfaces + neutral text
- **Variants-first**: prefer shadcn/ui primitives + variants over ad-hoc Tailwind in pages.
- **Accessibility**: every interactive element must have a visible focus state (`focus-visible` ring).

## Tokens (single source of truth)

- **CSS variables**: `src/index.css` defines HSL tokens.
- **Tailwind mapping**: `tailwind.config.ts` maps Tailwind colors to the CSS variables.

### Brand palette

| Token | Value | Usage |
|---|---|---|
| `primary` | `#FF0068` | Primary CTA only |
| `primary-light` | `#FF1A7D` | Hover tint for primary |
| `primary-lighter` | tint | Background tint (e.g. `bg-primary/10`) |
| `chart-1` → `chart-5` | `#FF0068` → `#7C39FF` | Charts/visualizations only |

### Neutral surfaces

| Token | Value | Usage |
|---|---|---|
| `background` | `#FFFFFF` | Page background |
| `card` | `#F5F6F8` | Card/surface background |
| `muted` | `#F5F6F8` | Muted surface (hover states, subtle fills) |
| `accent` | slightly darker grey | Hover/focus surface for list items, menu items |
| `secondary` | `#F5F6F8` | Secondary surface |
| `border` / `input` | neutral grey | All borders — never tinted |

### Allowed semantic colors (usage rules)

- **`primary`**
  - Use for: primary CTA buttons, active tab indicator dot/tint, checked checkboxes/radio.
  - Avoid for: borders on unchecked inputs, navigation hover backgrounds, table chrome.
- **`success` / `warning` / `destructive`**
  - Use for: status badges, inline status text, alert states.
  - Avoid for: general emphasis.
- **`accent`**
  - This is a **neutral hover surface** (slightly darker than muted).
  - Use for: hover/focus backgrounds on list items, menu items, popover rows.
  - Do NOT use for: brand color, charts, or any colored emphasis.
- **`chart-1` → `chart-5`**
  - Use for: chart series colors only (pink → purple gradient).
  - Do NOT use in UI chrome.

### Borders & elevation

- **Borders**: neutral only (`border`, `input`). No tinted borders for hover/active states.
- **Unchecked inputs** (checkbox, radio): use `border-input` (neutral grey). Only show `border-primary` when checked/selected.
- **Shadows**: off by default. Only add elevation when there is a clear layering need (dialogs, popovers). Do not add "decorative" card shadows.

## Typography

- Font: **DM Sans** (Tailwind `font-sans`).
- Prefer hierarchy via:
  - `text-sm` for labels/controls
  - `text-base` for body
  - `text-lg/2xl` for section titles
  - `font-medium` for emphasis; avoid heavy weights unless needed

## Spacing & density

- Use a consistent rhythm: 8 / 12 / 16 / 24 px (Tailwind `2`, `3`, `4`, `6` multiples).
- Prefer fewer containers; avoid nested borders.

## Interaction rules (hover / active / focus)

### Hover

- **Filled primary buttons**: use a subtle opacity shift (`hover:bg-primary/90`).
- **Neutral controls (ghost/outline)**: use neutral surface hover (`hover:bg-muted`), keep text neutral.
- **List items / menu rows**: use `hover:bg-accent` (neutral grey surface).
- Avoid changing border colors on hover.

### Active/selected

- Use **surface + typography** first:
  - Active nav tab: `bg-primary/10 text-primary font-semibold` (tinted pink surface, no solid fill)
  - `bg-muted` / `bg-secondary` + `font-medium` for other selected states
  - Avoid solid `bg-primary` for navigation/tab chrome.

### Focus

- Use consistent focus ring:
  - `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

## Component standards (shadcn/ui)

### Buttons (`src/components/ui/button.tsx`)

- Use variants; do not invent bespoke CTA styles in page components.
- `outline` and `ghost` are **neutral** (no `accent` hover).

### Checkboxes (`src/components/ui/checkbox.tsx`)

- Unchecked: `border-input` (neutral grey border).
- Checked: `bg-primary border-primary` (brand pink fill).

### Radio groups (`src/components/ui/radio-group.tsx`)

- Unchecked: `border-input` (neutral grey border).
- Checked: `border-primary` (brand pink border).

### Cards (`src/components/ui/card.tsx`)

- Default is **bordered surface, no shadow**.
- If you need "raised" UI, use a dedicated component/variant with explicit intent (rare).

### Sidebar / navigation (`src/components/ui/sidebar.tsx`)

- Active + hover states are neutral surfaces.
- Avoid shadows on persistent chrome.

## Implementation guardrails (do / don't)

- **Do**: use `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`.
- **Do**: use semantic tokens (`primary`, `success`, `warning`, `destructive`) only when they mean something.
- **Do**: use `hover:bg-muted` for ghost/outline button hover.
- **Do**: use `hover:bg-accent` for list item / menu row hover.
- **Don't**: introduce hex colors in class strings (`text-[#...]`, `bg-[#...]`).
- **Don't**: add `shadow-*` to cards/layout containers.
- **Don't**: add "pretty" gradients outside chart contexts.
- **Don't**: use `border-primary` on unchecked/unselected inputs.
- **Don't**: use `bg-primary` for navigation tab active state (use `bg-primary/10 text-primary` instead).
