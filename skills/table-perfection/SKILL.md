---
name: table-perfection
description: Use whenever creating, reviewing, or refactoring any data table, list view, or grid UI component. Applies data-aware React and Tailwind rules for columns, pills, actions, toolbars, accessibility, responsiveness, and light/dark surfaces.
---

# Table Perfection

## Core principle

Let the data drive the table's form. Never lay out a table generically. Justify every column's formatting by the data it holds and the operator's decision or action.

Before adding styles, inspect `multideck.client/src/styles.css` and root `design.md`. Reuse their semantic CSS variables, Tailwind mappings, spacing, radius, surface, hairline, and status tokens. Do not hardcode colours or invent a parallel table palette.

## Workflow

1. Inspect the target component, its columns, data shape, existing shared table primitives, and surrounding workflow.
2. Classify every column by data type and purpose. Explicitly classify each pill-bearing column as **status** or **attribute** before styling it; ask the user when that distinction is genuinely ambiguous.
3. Apply the column, pill, colour, disclosure, accessibility, surface, and toolbar checks below.
4. Flag date/time columns when sequence is the primary story. If table versus timeline is ambiguous, build both variants and let the user choose.
5. Verify realistic data, empty/loading/error/disabled states, keyboard access, responsive behaviour, RTL where relevant, and light/dark modes.
6. Finish with a short diff summary: what changed, why, and which rule triggered each change.

## Column checklist

- **Numeric:** Right-align values and use `tabular-nums`; do not use monospaced type.
- **Long text:** Constrain width, truncate with an ellipsis, and expose the full description, name, or email through a title or accessible tooltip.
- **Identity:** Pair a user, assignee, or owner name with an avatar. Provide a stable fallback such as initials and retain the text label.
- **Date/time:** Format consistently for the user's locale. When time-ordering is the table's main purpose, recommend a timeline rather than forcing chronology into flat rows.
- **Row state:** Visibly mute inactive, deactivated, archived, or disabled rows with reduced opacity or a token-based muted surface. Preserve readable contrast and never make them look active.

## Pills: status versus attribute

Use this rule of thumb: **the indicator carries semantic colour; the pill shell stays native to the table theme.**

### Status

Use for changing operational state such as active/inactive, approved/pending/rejected, online/offline, or paid/overdue.

- Match the table surface background, use the theme's primary text colour, and add a thin token-based hairline stroke.
- Add a small status icon before the label, such as a dot, check, x, or clock. Do not rely on colour alone.
- Apply the documented semantic status colour to that icon or indicator, not the full shell or label.
- Define or reference the component's documented status enum and map each value deliberately to the existing semantic system.

### Attribute

Use for static classification such as department, type, category, or tag.

- Keep every pill on the same table-surface background, primary-text treatment, and thin token-based hairline stroke.
- Differentiate values only with a 4–6px filled circle or square before the label.
- Assign indicator colours from a fixed, deterministic token palette. Never colour the entire attribute pill by category.

## Colour rules

- Require every colour to map to data meaning: status, urgency, risk, or category. Reject decorative colour.
- Prefer a documented semantic enum and the existing success/warning/danger-style tokens over ad hoc colour choices.
- Keep status meaning explicit through its icon shape and documented mapping rather than a louder shell.
- Do not introduce hardcoded hex, RGB, or raw Tailwind palette values when a project token or semantic class exists.

## Progressive disclosure and invisible UI

- Keep at most one primary row action visible.
- Reveal secondary row actions on row hover **and keyboard focus**, or place them in an ellipsis menu/popover.
- Put bulk or infrequent table actions such as share, export, and filter presets in a popover or dropdown instead of permanent header buttons.
- Give every hover/focus-revealed action, icon-only button, and ambiguous abbreviation an accessible tooltip.
- Reveal a copy control on hover and focus for copyable IDs, emails, and codes; announce successful copy without changing the value.
- Keep comment indicators, expand carets, menus, and every hidden affordance reachable and visible by keyboard. Hover must never be the only access path.

## Light and dark surfaces

- Use the existing table/body surface tokens from `multideck.client/src/styles.css`; do not create new colours for dark mode.
- In light mode, use a quiet light-grey token-based header shelf with slightly muted text over a white body surface.
- In dark mode, make the header one subtle tonal step darker or more muted than the body surface.
- Separate body rows with horizontal-only, one-pixel token-based hairlines. Use a low-opacity light/grey hairline on dark surfaces, never harsh white.
- Keep header/body contrast subtle. Do not use a branded or high-contrast banner treatment.
- Avoid zebra striping unless the user explicitly requests it and the dense data benefits from it.

## Toolbar

- Put all table-level controls in one aligned toolbar row directly above the table, never inside the column-header row or the table's rounded surface/container.
- Let the toolbar sit transparently on the page background; the rounded, stroked surface begins at the table header shelf.
- Anchor view or grouping toggles on the left as navigation between views of the same data.
- Reserve the canonical `toolbarTabs` slot for those left-side tabs or view toggles only; never pass search, filters, actions, import, export, or utility buttons into it.
- Group refinement controls on the right in this order: search → filters → sort, export, density, or view options → **Columns last at the far edge**.
- Keep inputs, buttons, toggles, and menus the same optical height and vertically aligned.
- On smaller viewports, collapse search, filters, and secondary options into one overflow menu before collapsing the left-side view toggles; keep the icon-only Columns control as the final item at the logical far edge.

## Reject these anti-patterns

- Left-aligned numbers.
- Free-text operational status without a semantic pill and icon.
- Fully coloured attribute pills.
- Every row action permanently visible.
- Decorative colour without data meaning.
- Time-series data forced into a flat table without offering a timeline.
- A loud or branded header background.
- Full row-and-column grid lines unless columns genuinely require separation.
- Search, filters, or column controls scattered inside the column-header row.
- View navigation and refinement controls mixed together without left/right separation of purpose.
