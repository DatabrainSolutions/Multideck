# App responsive audit — 22 September 2026

## Scope

Reviewed the App frontend's shared layout system, 81 page entry files, and related component styles for fixed widths, viewport heights, dense grids, hover-only actions, and narrow-screen containment. Implemented shared fixes and targeted corrections in the existing local checkout, preserving concurrent CRM/backend work.

This is frontend source review plus representative browser testing, not a claim that every record, permission state, integration, or physical device has been exercised. No deployment was performed.

## Changes

- The application shell follows the dynamic viewport and device safe areas. Home uses a single column on phones, two on tablets, and four on wider desktops.
- Shared controls support 44px touch targets and 16px text entry on phones and coarse-pointer devices. Touch users can reach actions previously revealed only on hover.
- Dialogs, popovers, navigation sheets, and drawers stay within the viewport and contain their own scrolling. Phone drawers become full-screen modal panels with keyboard focus containment.
- Table toolbars adapt to their container width, including space lost to a tablet sidebar. Below 768px of available space, search and filters use the existing Controls popover. Saved pinned columns are temporarily unpinned when they would crowd the remaining content; saved preferences are retained.
- Tables expose a focusable, labelled scroll region and visible touch scroll cues. The column manager offers accessible reorder controls without relying on dragging or hover.
- Detail-page actions wrap. Inbox keeps Compose and settings visible at 320px and places mailbox information on a separate phone row. Lane comparisons no longer reserve an oversized fixed label column.
- Closing CRM pipeline settings preserves the existing board during refresh, keeping its position and allowing focus to return to the settings button.
- The component gallery's Side Drawer source now displays the actual implementation and documents its phone behaviour.

## Browser checks

Chrome against `http://localhost:3000`, using 320×568, 390×844, 768×1024, 1024×768, 844×390, and 1440×900 viewports. Touch emulation was used for coarse-pointer tablet checks, then removed along with temporary viewport/network overrides.

| Area | Observed result |
| --- | --- |
| Home, bookings, quotes, CRM dashboard/accounts/deals, tasks, calendar, rates, warehouse/inventory, documents, reports, receivables, customs export, road control, trips, admin users | Representative loaded phone views reviewed for page containment; wide data remained in its own scroll region. |
| Bookings and CRM dashboard | Tablet portrait/landscape layouts checked; the 1024px sidebar case no longer clips the booking toolbar. Desktop booking density retained at 1440px. |
| Settings | Phone section navigation and panels inspected at 320px; profile also inspected on tablet. No settings were edited. |
| Inbox, signatures, Dexter | Phone layouts inspected; Inbox Compose clipping fixed. Dexter also checked at tablet width. |
| Table controls | Search, no-results state, clear filters, column-manager dimensions, and keyboard horizontal scrolling exercised. No column preferences were changed. |
| Forms | New booking, contact, and warehouse-item dialogs opened and cancelled. Contact input survived rotation into a short landscape viewport; fields scrolled while the footer remained reachable. |
| Navigation and drawers | Escape, mobile focus containment, and return focus verified. Pipeline settings returned focus to its opener after the board-refresh correction. |
| Offline register | Existing rows and entered search survived a simulated connection loss; an error was visible and export was disabled. Clearing the query after reconnecting did not immediately clear the error during this check; reopening the register restored its rows, cleared the error and enabled export. This existing recovery limitation is separate from layout containment. |

## Automated validation

- `npm run build` passed (TypeScript and production Vite build). Existing large-chunk warnings remain.
- `git diff --check` passed.
- Focused table, pagination/export, shell, calendar, CRM, Inbox, wizard and gallery checks: **73 passed, 5 failed**.
- Existing assertions were updated only where this change deliberately changes shell height or table scroll affordances.

The five remaining failures predate this work:

1. Quote header class assertion no longer matches the existing quote workspace.
2. Booking status assertion expects the older status rendering rather than lifecycle status.
3. The table contract flags existing specialist tables outside its allowlist.
4. The wizard marker assertion expects an older colour class.
5. The gallery navigation contract has eight existing missing sidebar entries. The missing IDs were compared with `HEAD` and are identical.

## Limits and QA side effect

Real iOS/Android browser chrome, software keyboards, device notches, and assistive technology still need physical-device verification. Chrome emulation does not prove those behaviours. External/public and unauthenticated workflows were not exhaustively exercised, and native mobile tooling was not changed.

Opening the existing `/quotes/new` route automatically created blank draft **JQ20030** during QA. It is unsent and has no customer or pricing entered by this audit. It was left in place; no deletion was attempted.
