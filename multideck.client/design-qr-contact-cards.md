# QR Contact Cards — implementation notes

Status: frontend complete, no backend. This records what was built, the design
rules it holds to, and the exact surface a backend has to fill.

The core object is a **contact card**: a shareable QR code that represents one
person. A visitor scans it, shares their details, and receives that person's
contact details back. Lead source and automation are optional per-card setup,
not the point of the feature.

---

## 1. Where it lives

| Route | Surface | Auth |
| --- | --- | --- |
| `/crm/contact-cards` | Card register and summary | Required |
| `/crm/contact-cards/:cardId` | Card workspace, `?tab=` per section | Required |
| `/card/:slug` | Public contact exchange | **None — public by design** |
| `/card/:slug?preview=1` | Preview: records no scan, creates no lead | None |

Navigation sits beside Leads under *Leads & opportunities*, because a card's
output is a lead. `App.tsx` renders the public route ahead of the auth gate and
exempts it from the unauthenticated redirect and the customer-role redirect.

Card workspace tabs: **Overview · Design · Automation · Analytics · Settings**.

---

## 2. Files

| File | Responsibility |
| --- | --- |
| `src/lib/qr-code.ts` | Dependency-free QR encoder. Byte mode, versions 1–10, levels M/Q/H. Styled geometry and logo knockout. |
| `src/lib/color.ts` | Contrast maths and the accent-safety gates. |
| `src/lib/card-theme.ts` | Branding → concrete colours, radii and CSS custom properties. |
| `src/lib/contact-card-store.ts` | Demo store: localStorage, simulated latency, migration, all mutations. |
| `src/data/contact-card-data.ts` | Types, seeded demo cards, derived analytics. |
| `src/components/multideck/contact-card-components.tsx` | QR rendering, code panel, status, metrics, shared states. |
| `src/components/multideck/contact-card-public-view.tsx` | The public page's presentational parts, shared with the live preview. |
| `src/components/multideck/contact-card-design.tsx` | Branding controls and live preview. |
| `src/components/multideck/contact-card-canvas.tsx` | The automation flow canvas. |
| `src/components/multideck/contact-card-dexter.tsx` | Ask Dexter: prompt → proposal → accept. |
| `src/components/multideck/contact-card-automation.tsx` | Automation panel, drawers, publish confirmation, run log. |
| `src/components/multideck/contact-card-analytics.tsx` | Funnel, timeline, breakdowns, privacy treatment. |
| `src/pages/contact-cards-page.tsx` | Register, creation, workspace, settings. |
| `src/pages/contact-card-public-page.tsx` | Public flow state machine. |
| `tests/qr-code.test.ts` | Encoder regression tests. |

Shared changes are limited to `App.tsx` (routes), `data/navigation-data.ts`
(nav entries) and `styles.css` (canvas backdrop). No backend contracts touched.

---

## 3. The QR encoder

Written from scratch because the project has no QR dependency.

- Byte mode, versions 1–10, error correction **M**, **Q** and **H**.
- Automatic version selection; returns `null` past capacity rather than
  emitting a broken symbol.
- Reed–Solomon over GF(256), block interleaving, all 8 masks scored by the
  specification's four penalty rules, BCH format and version information.
- Styling: square / rounded / dots modules, square / rounded / circle eyes.
  Rounded modules only round a corner where both neighbours are light, so runs
  stay visually joined.
- **Logo in the middle** clears an odd, centred square (24% of width) and forces
  level H, because knocking a hole in a symbol only stays scannable with the
  redundancy to reconstruct it.
- One matrix drives the on-screen SVG, the SVG download and the PNG download,
  so the printed code is the code that was designed.

Verified by decoding rendered output with Chrome's `BarcodeDetector`: all 18
combinations of module style × eye style × with/without logo decode to the exact
payload, across versions 1, 4, 7 and 10.

---

## 4. Design rules the code holds to

**Nothing is promised before it is true.** The exchange screen only exists after
a confirmed write. There is no optimistic success.

**Deduplication is invisible to the visitor.** Matching is on normalised email.
Existing non-empty fields are never overwritten. The visitor always sees the same
success; the split between *created* and *matched* only appears in the workspace.

**Brand colour is checked, not trusted.** An accent may sit behind action text
only if it is legible *and* separable from the page behind it. Ink flips between
light and dark automatically, so the check that actually bites is separation
from the background — a pale accent on a pale page falls back to a readable
colour, and the Design tab says so.

**Only one action reaches the outside world.** Sending an email requires an
explicit publish dialog stating the consequence in plain sentences, offers a
test send, can be paused in one tap, and auto-pauses after repeated failures.

**Location is country and region only.** No map, no browser geolocation prompt,
no coordinates. Buckets below 5 scans collapse to "Other regions" so a single
visitor cannot be identified.

**Motion.** No `transition: all`, no animation of layout properties, no
entrance animations on load, no chart draw-on. Press 160–180ms, content swap
200–240ms, drawers 300ms. The public form→exchange transition is asymmetric on
purpose: it leaves on an accelerating curve and arrives on a decelerating one.
Every transition degrades under `prefers-reduced-motion`.

**Typography.** Public form inputs are 16px — below that, iOS Safari zooms on
focus and throws the layout away mid-form. Every comparable number uses
`tabular-nums`.

---

## 5. Automation

A guided vertical flow on a pan/zoom canvas, not a free-form node graph. The
earlier recommendation was a plain list; the canvas was chosen instead, with
these concessions so it stays usable for non-technical people:

- Steps lay themselves out. Nobody has to position or connect anything.
- Steps are added at **insertion points between existing steps**, from a menu
  written in plain language ("Only continue if…", "Create a task — a reminder to
  follow up").
- Reordering is by drag handle and is **constrained to the step's own group**,
  so an action cannot be dragged above the condition that gates it.
- Editing always opens a drawer, never an inline expansion that reflows the flow.
- Every step row carries edit / pause / remove, revealed on hover and on focus.
- Full-screen mode for long automations; pinch to zoom; a plain wheel still
  scrolls the page rather than being trapped by the canvas.

**Ask Dexter** takes a plain-language description and proposes conditions and
actions. Each suggestion is individually accepted or rejected, everything lands
as an unpublished draft, and anything that emails a lead still goes through the
publish confirmation.

v1 scope: one fixed trigger (*someone shares their details*), up to 5 AND
conditions, up to 8 ordered actions, of which only *send an email* is external.

---

## 6. Data states

Every surface has loading, empty, error and success states. Reachable on demand
through a URL flag on any card route:

```
?demo=loading   hold the loading state
?demo=slow      2.4s latency
?demo=error     load failure with retry
?demo=empty     no cards
?demo=submit-error   public form submission failure
```

Seeded cards cover the rest: an active card with a live email action, one
auto-paused after failures, one with defaults only, and one draft with no scans
(the empty analytics state).

---

## 7. Backend integration surface

Everything to be replaced lives in `src/lib/contact-card-store.ts`. The UI
imports only these functions, so swapping the bodies should be the whole job.

**Reads**

| Function | Becomes |
| --- | --- |
| `useContactCardStore()` | `GET /crm/contact-cards` |
| `useContactCard(id)` | `GET /crm/contact-cards/:id` |
| `loadPublicCard(slug)` | `GET /public/cards/:slug` — unauthenticated, published cards only |

**Writes**

| Function | Becomes |
| --- | --- |
| `createCard(input)` | `POST /crm/contact-cards` |
| `updateCard(id, fn)` | `PATCH /crm/contact-cards/:id` |
| `updateBranding(id, patch)` | `PATCH .../branding` |
| `setCardStatus(id, status)` | `PATCH .../status` |
| `deleteCard(id)` | `DELETE /crm/contact-cards/:id` |
| `updateAutomation`, `publishAutomation`, `pauseAutomation`, `resumeAutomation`, `turnAutomationOff` | `PATCH .../automation` and `POST .../automation/publish` |
| `sendAutomationTest()` | `POST .../automation/test` |
| `readLogoFile(file)` | Replace the data-URL read with an upload; store a URL on `branding.logoDataUrl` |

**Public flow**

| Function | Becomes |
| --- | --- |
| `recordScan(cardId, preview)` | `POST /public/cards/:slug/scan` — server derives device, browser, channel and region; must not store raw IP |
| `recordFormStarted(cardId, scanId)` | `POST /public/cards/:slug/scan/:scanId/started` |
| `submitExchange(...)` | `POST /public/cards/:slug/exchange` — creates or matches the lead, stamps `leadSource`, queues the automation |

**Analytics.** `cardTotals`, `cardTimeline`, `deviceBreakdown`,
`browserBreakdown`, `channelBreakdown`, `locationBreakdown` and
`automationOutcomeBreakdown` in `data/contact-card-data.ts` currently derive
everything from a per-card `scans` array. Server-side they become aggregate
endpoints; keep the same shapes and the components need no change. The
small-bucket suppression in `locationBreakdown` must move server-side so
suppressed rows never reach the client.

**Client-side behaviour that must be enforced on the server, not trusted:**
deduplication on normalised email; preview traffic excluded from analytics and
creating no lead; paused and draft cards refusing public submissions;
auto-pause after consecutive automation failures.

---

## 8. Product decisions still open

1. One code per card, or per rep? The public URL already reserves `?r=`.
2. Consent model — notice only, or a required tick. Legal to confirm.
3. What is actually stored per scan, and for how long. The privacy copy on the
   Analytics tab asserts no raw IP retention; that has to be made true.
4. Whether changing a card's lead source may rewrite existing leads. The UI
   states it does not.
5. Permission to enable external-effect actions, separate from editing a card.
6. Whether the email action sends from the card owner's address or a system
   address with reply-to.
