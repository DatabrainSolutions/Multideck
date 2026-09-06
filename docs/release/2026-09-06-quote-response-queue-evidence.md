# Customer-response notification queue checkpoint

## Outcome

The existing global popup now waits for the clicked Quote workspace to finish
loading before advancing. A route change plus two animation frames previously
advanced the queue even while the asynchronous Quote request was unfinished.
Quote Details now identifies its requested route and loading/ready/error state;
stale content for a different Quote cannot report that requested Quote ready.

The popup being read is no longer pre-empted by a late event with an older
response timestamp. Waiting items remain sorted by response time. Switching
signed-in users remounts the queue and late callbacks from a disposed subscription
are ignored. Only internal Quote detail paths are valid popup destinations.

The existing notification bell, preferences, store and persistence API are
unchanged. Popups still expire after 5.5 seconds without marking the notification
read or dismissed. Clicking/dismissing uses the existing three-attempt retry.
Failed/slow Quote loading holds the queue with explanatory text and keeps the
dismiss action available. This is internal Multideck-owned UI, not tenant email
branding. Accessibility guidance retained keyboard activation and focusability
while a Quote is opening; the user's explicit timeout rule remains authoritative.

## Evidence

- `node --test multideck.client/tests/quote-response-notification-queue-contract.test.mjs multideck.client/tests/notification-store.test.mjs`: 10 pass, zero fail/skip.
- `npm run build` in `multideck.client`: TypeScript and Vite pass. Existing large-chunk warnings remain; no threshold was weakened.
- `supabase/tests/tools/quote-response-queue-browser.mjs` runs the actual queue
  component, hooks, timer/retry functions and readiness observer in isolated
  Chrome. Both en-GB and en-US browser contexts pass: non-pre-emption and sorted
  waiting queue, duplicate rejection, 5.5-second timeout with no persistence
  mutation, keyboard activation, six-second delayed loading, explicit load
  failure then successful readiness, three failed dismissal attempts, account
  switch and stale callback isolation, and 320/768/1280px no-overflow checks.
- Browser page errors: none. Rendered screenshot inspected at
  `/tmp/multideck-quote-response-queue.png`.
- `git diff --check`: pass.

## Limits and release state

Local source only; not deployed. The browser harness explicitly substitutes
Realtime transport, persistence and page loading. It is not proof of hosted
Realtime reconnection, notification preferences, server persistence, real Quote
page readiness, screen-reader announcements or full customer-response delivery.
The existing store tests cover shared reads, optimistic failure recovery and
account isolation separately. The harness uses reduced motion and the existing
English copy; it is not full regional-language or motion certification.

No tenant request, email, Quote/Booking write, PDF generation, Customs record,
permission or deployment setting was changed by these checks. The separately
requested revised-Quote email test still awaits user approval. Broader freight
completion and matching deployment remain open.
