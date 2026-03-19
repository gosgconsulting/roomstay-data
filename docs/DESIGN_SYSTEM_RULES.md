# DESIGN_SYSTEM_RULES.md

## Purpose

This document is the visual source of truth for the product UI. All new pages, components, and refactors must follow these rules.

---

## 1. Core Design Direction

- **Product style:** Minimal, clean, modern SaaS, soft surfaces, subtle elevation, rounded but not playful, professional.
- **Visual tone:** Light mode default; dark mode mirrors hierarchy; purple primary brand accent; neutrals dominate.
- **Design principles:** Clarity over creativity; reuse existing tokens; quiet UI; spacing/typography for hierarchy.

---

## 2. Token Source of Truth

Use CSS variables from `:root` and `.dark`:

- **Surfaces:** `--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--accent`, `--secondary`
- **Brand & semantic:** `--primary`, `--destructive`
- **Chrome:** `--border`, `--input`, `--ring`
- **Layout:** `--radius`, `--spacing`
- **Typography:** `--font-sans`, `--font-serif`, `--font-mono`
- **Charts:** `--chart-1` through `--chart-5`
- **Sidebar:** `--sidebar-*` (e.g. `--sidebar-background`, `--sidebar-foreground`)

Do not hardcode hex/rgb in components; reference these tokens via Tailwind or CSS.

---

## 3. Non-Negotiable Rules

**Do not:**

- Hardcode hex colors in class strings or inline styles.
- Invent new spacing values; use `--spacing` or Tailwind spacing scale.
- Add random shadows; use elevation only where layering is required (dialogs, popovers).
- Mix radius styles (e.g. different radii for cards vs buttons); use `--radius` consistently.
- Use bright colors for decoration; reserve color for meaning (primary, status).
- Create multiple button styles for the same meaning; use variants from the design system.
- Use gradients or glassmorphism without explicit approval.

**Always:**

- Use design tokens for color, spacing, radius, and typography.
- Reuse existing patterns and components before adding new ones.
- Keep hierarchy consistent (typography + spacing first, then color).
- Support light and dark mode via token usage.
- Prefer system consistency over one-off styling.

---

## 4. Color

- **Primary:** Use `--primary` for CTAs, active indicators, checked states. Purple brand accent only where meaning is “primary action” or “selected.”
- **Neutrals:** Use `--background`, `--foreground`, `--card`, `--muted`, `--accent`, `--border`, `--input` for all UI chrome. Neutrals dominate; primary is accent.
- **Semantic:** Use `--destructive` for destructive actions only. Do not introduce new semantic colors without adding tokens.
- **Charts:** Use `--chart-1` through `--chart-5` for data visualization only, not for UI chrome.

---

## 5. Typography

- **Font stack:** Prefer `--font-sans` for UI; use `--font-mono` for code/data; `--font-serif` only when explicitly needed.
- **Hierarchy:** Use size and weight (e.g. `text-sm` for labels, `text-base` for body, `text-lg`/`text-2xl` for headings). Avoid heavy weights unless required.
- **Color:** Use `--foreground` for primary text, muted tokens for secondary. Do not use primary color for body copy.

---

## 6. Radius

- Use `--radius` (and Tailwind `rounded-*` mapped to it) consistently across cards, buttons, inputs, and popovers.
- Do not mix custom border-radius values; one radius scale for the product.

---

## 7. Shadow

- Shadows off by default. Use only when elevation is required: modals, popovers, dropdowns.
- Do not add decorative shadows to cards or layout containers. Prefer border + background for separation.

---

## 8. Spacing

- Use `--spacing` and the Tailwind spacing scale (e.g. 8/12/16/24 px rhythm). No arbitrary spacing values.
- Prefer fewer containers; avoid nested borders and redundant padding.

---

## 9. Components

- Use shared UI primitives (e.g. Button, Card, Input, Checkbox, Radio) and their variants. Do not invent new one-off component styles.
- Buttons: use `primary` for main CTA; `outline`/`ghost` for secondary; keep meaning consistent.
- Cards: default bordered surface, no shadow; use elevation only via explicit variant or component.
- Inputs: neutral border (`--border`/`--input`); primary only for focus ring and checked/selected state.

---

## 10. Sidebar

- Use `--sidebar-*` tokens for background, foreground, border, and active/hover states.
- Active and hover states: neutral surfaces (e.g. `--accent`, `--muted`). Do not use solid primary for nav chrome; use tint (`primary/10`) if brand highlight is needed.
- Avoid shadows on persistent sidebar chrome.

---

## 11. Dark Mode

- Dark mode must mirror the same hierarchy as light mode. Use the same token names under `.dark`; only values change.
- Ensure contrast and focus states remain clear in both themes. Test all new UI in both modes.

---

## 12. Charts

- Use `--chart-1` through `--chart-5` for chart series and data visualization only.
- Do not use chart tokens for buttons, badges, or UI chrome.

---

## 13. Interaction

- **Hover:** Filled primary buttons: subtle opacity shift; neutral controls: `--muted` or `--accent` surface. Do not change border color on hover for neutral controls.
- **Active/selected:** Prefer surface + typography (e.g. `bg-primary/10 text-primary`) over solid primary for nav/tabs.
- **Focus:** Visible focus ring using `--ring` and offset; every interactive element must have `focus-visible` styling.

---

## 14. Page Composition

- Use consistent layout patterns: background (page), card/surface (content), popover/dropdown (overlay). Respect elevation order: background &lt; card &lt; popover &lt; modal.
- Avoid nested cards with conflicting elevation; keep a single clear stacking context per flow.

---

## 15. Reuse Before Create

- Before adding a new component or pattern, check for an existing variant or primitive that can be reused or extended.
- New styling must align with tokens and existing components; no duplicate patterns for the same purpose.

---

## 16. Code Rules

- No hex/rgb in JSX or component styles; use Tailwind token-based classes (e.g. `bg-background`, `text-foreground`, `rounded-lg`).
- No inline styles for colors, spacing, or radius; use design tokens via Tailwind or CSS variables.
- Keep component styling in the component layer; avoid page-level overrides that bypass the design system.

---

## 17. QA Checklist

Before shipping UI changes:

- [ ] All colors use tokens (no hardcoded hex).
- [ ] Light and dark mode both checked.
- [ ] Focus states visible for all interactive elements.
- [ ] Spacing and radius use design system scale.
- [ ] No new shadows except for elevation (dialogs, popovers).
- [ ] Buttons/links use correct variants for their meaning.
- [ ] No chart tokens used in UI chrome.

---

## 18. Design System Decision Rule

When in doubt: **prefer the token or pattern that already exists.** If something is missing, extend the token set or add a documented variant rather than inventing a one-off style. Changes that affect multiple screens or components belong in the design system (tokens or shared components), not in a single page.

---

## 19. Summary

- **Visual source of truth:** This document. All UI must follow it.
- **Tokens:** `:root` and `.dark` CSS variables; no hardcoded color/spacing/radius.
- **Principles:** Minimal, professional SaaS; purple primary accent; neutrals dominate; clarity and reuse over one-off creativity.
- **Rules:** Use tokens, support light/dark, consistent hierarchy, no decorative shadows/gradients, reuse before create, and validate with the QA checklist.
