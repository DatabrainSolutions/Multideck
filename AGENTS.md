# Multideck AI Working Instructions

These instructions apply to anyone using AI coding tools in this repo, including Codex, Cursor, Claude, or similar assistants.

## Product Mindset

Build Multideck like a premium, modern freight-forwarding product for real operators.

Prioritise:
- Product quality
- UX clarity
- Speed
- Simplicity
- Maintainability
- Practical shipping

Avoid:
- Generic SaaS templates
- Overengineered abstractions
- Visual clutter
- Random one-off styling
- Code that is clever but hard to understand

The user is a non-technical founder with strong product instincts. Explain decisions simply and focus on the outcome, the product reason, and the user impact.

## Frontend Scope

Keep all client UI work inside `multideck.client`.

Use the existing structure:
- `src/components/ui` for shared UI primitives.
- `src/components/multideck` for Multideck-specific product components.
- `src/pages/components-gallery-page.tsx` for the components page.
- `src/data/multideck-data.ts` for component-gallery metadata.
- Root `design.md` for the current design system direction.

Do not place client components, design docs, or frontend config in the server folder.

## Component Reuse Rule

When adding any new section, screen, panel, workflow, or UI feature:

1. First check the existing components in `multideck.client/src/components`.
2. Reuse the existing components wherever they fit the job.
3. Compose existing components before creating new ones.
4. Only create a new component when the UI pattern is genuinely reusable or clearly improves readability.
5. Do not duplicate an existing component under a new name.
6. Do not create one-off visual patterns that bypass the design system.

If a new product component is needed, add it in `multideck.client/src/components/multideck`.

## Language Support Rule

Every new screen, component, panel, workflow, setting, and visible UI state must support the app-wide language system from the start.

When adding new UI:
- Make visible text localisable through the existing language layer.
- Avoid hardcoding user-facing copy in a way that cannot be translated.
- Check that the UI still works when the app is switched away from English.
- Check Arabic or another right-to-left language when the layout includes navigation, rows, sidebars, forms, icons, or directional controls.
- Use direction-safe layout patterns and avoid assumptions that the interface is always left-to-right.
- Keep form inputs, emails, URLs, codes, tracking numbers, and phone numbers readable in both left-to-right and right-to-left modes.

Language support is part of the definition of done. A new reusable component or product screen is not complete if it only works properly in English.

## Components Page Rule

Any new reusable component must also be added to the components page.

Important: full screens, pages, routes, workspaces, and multi-step flows are not components.

Do not add a full screen preview to `/components` and call it a component. For example:
- Do not add `Auth Flow` as one component.
- Do not add `Bookings Table` as a scaled full bookings page.
- Do not add `Booking Detail Workspace` as a scaled full detail route.

Instead, break the screen into its real reusable parts and add those:
- A KPI box is a component.
- A segmented view switch is a component.
- A filter chip row is a component.
- A checklist is a component.
- A sign-in form panel is a component.
- A verification code input is a component.
- A signed-out recap panel is a component.

Before adding anything to `/components`, do a component inventory:
1. Identify the full screen or flow being built.
2. List the smaller UI parts it is composed from.
3. Reuse existing entries where the part already exists.
4. Add only the genuinely new reusable parts to the components page.
5. Keep the full assembled screen on its product route, not as a gallery component.

That means:
- Add the component to the gallery metadata in `multideck.client/src/data/multideck-data.ts`.
- Add or update the preview in `multideck.client/src/pages/components-gallery-page.tsx`.
- Include a plain-English description of when to use it.
- Include the component source code for the Code tab.
- Include a realistic usage snippet for the Usage tab.
- Include quick links to every page or screen where the component is used.
- Make sure it can be inspected from the `/components` route.

The components page is the source of truth for the app's reusable UI system. If AI creates a component but does not add it there, the work is not finished.

When reusing an existing component on a new page or screen, update that component's quick links on the components page in the same change. The goal is that someone inspecting any component can immediately jump to the real product surfaces where it appears.

## Design Rules

Use layout hierarchy before decoration.

Prefer organisation through:
- Spacing
- Typography
- Alignment
- Rows and columns
- Clear visual rhythm

Avoid:
- Cards inside cards
- Containers inside containers
- Random bordered sections
- Dashboard clutter
- Repeated layouts that do not match the workflow

Typography should stay calm and readable. Prefer SF Pro-style system fonts, regular and medium weights, and restrained sizes.

Use the Multideck design tokens and CSS variables instead of hardcoded one-off colours, spacing, shadows, or radius values.

## Corner Radius Rule

Corners must always nest correctly.

When one rounded surface sits inside another, the inner radius should be smaller than the outer radius by the amount of spacing between them.

Use this relationship:
- Outer radius = inner radius + padding
- Inner radius = outer radius - padding

Example:
- Parent radius: 16px
- Parent padding: 4px
- Child radius: 12px

Avoid using the same radius for a parent and child surface. Matching radii on nested elements make the spacing feel uneven and less premium.

Apply this to cards, panels, buttons, inputs, modals, sidebars, dropdowns, overlays, and any nested UI surface.

## Interaction Rules

Interactions should feel fast, calm, and precise.

Prefer subtle:
- Opacity changes
- Small scale changes
- Smooth easing
- Clear hover and focus states

Avoid loud motion, bouncy effects, excessive animation, or anything that makes the product feel less serious.

## Browser Rule

The user's default browser is Atlas, not Chrome or Safari.

When opening or testing in a browser, assume Atlas unless the user explicitly asks for another browser.

## Final Check Before Finishing

Before saying the work is done:
- Confirm the UI uses existing components where possible.
- Confirm new user-facing text supports the app-wide language system.
- Confirm any direction-sensitive UI works in Arabic / right-to-left mode when relevant.
- Confirm any new reusable component appears on the components page.
- Check that the result still feels calm, premium, and believable.
- Check that nested corners follow the radius rule.
- Run the most relevant local check for the files changed when practical.
