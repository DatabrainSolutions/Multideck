# Hosted dangerous-goods approval and watch lifecycle

This follows the [source-fidelity correction](2026-09-07-dangerous-goods-source-fidelity.md).
Development is READY at `e186908`; Dexter 165 and Booking 43 are ACTIVE.
All writes below use normal signed-in operator UI; SQL reads collect evidence.
The data is synthetic, not a real classification, dangerous-goods declaration,
transport approval or compliance decision.

## Approved creation and exact source

Conversation `e73ddcf5-0209-422b-a818-4988c72a37d7` read JE0991134 cargo 1,
`47069295-655d-43d3-9583-7ee917d6552f`. Prepared action
`11fefea8-54f5-4ebd-9bca-f106fd6e1552` preserved exactly:

- properShippingName: `QA-DEXTER-DG-20260907-NOT-A-SHIPMENT`
- sourceReference: `Synthetic Dexter lifecycle verification only — not a classification`
- reason: `Verify approved Dexter recording on internal synthetic cargo.`

Before approval, no new DG row existed. After the reviewed normal Approve
control, action status is succeeded and record
`aecd5dc4-3058-4c0d-ab1a-6d2d1acd4d60` was created at
`2026-09-07T11:28:09.150605Z`. UN number, class, packing group, flash point,
both flags, emergency contact and notes remained null. Canonical and Dexter
audit rows attribute the action to `4467c131-7068-4a7e-8ebc-e51d2d4af01c`.
A fresh hosted Booking load displayed the record for correction.

## Exact notification-only watch

Dedicated Watchers setup accepted the descriptive request containing the exact
DG UUID, Booking and cargo. Watch `f5def8e7-5f74-4920-b7ca-0b0c2aabccb9`,
`QA dangerous-goods flag changes`, uses capability `booking_dangerous_goods`,
the exact target and rule `marinePollutant / changed`. Action JSON is null.
Source-backed target label is
`JE0991134 · Cargo 1 · QA-DEXTER-DG-20260907-NOT-A-SHIPMENT`.

| Saved transition | Watch state | Cumulative events / notifications |
| --- | --- | ---: |
| Unknown → No | Active | 1 / 1 |
| Notes-only change | Active | 1 / 1 |
| No → Yes | Paused | 1 / 1 |
| Yes → unknown, temporary notes cleared | Resumed | 2 / 2 |
| Unchanged Save | Active | 2 / 2 |
| Record → Voided, flag still unknown | Active | 2 / 2 |

Pause/resume were confirmed in the database before the subsequent edit. The
visible alert names JE0991134/cargo 1 and explicitly says it is not a compliance
approval. Its detail shows the exact saved target, rule and one alert after the
first matching change. No external email or autonomous action was created.
Final watch state is paused; the two events and notifications are retained.

Retired-target denial was tested twice: first with retirement stated in the
request (a compiler refusal), then without that hint. The second request used
the exact saved ID and returned the resolver's "Choose an active
operator-recorded dangerous-goods entry you can access." Only the original
paused DG watch exists afterwards; no replacement or reactivation occurred.
This is actual retired-source denial, not a cross-user/project test.

## Final retained state and evidence limits

Record is voided/read-only at `2026-09-07T11:33:13.640748Z`. Temporary Notes
and both flags are null. Exact source text and synthetic identity remain.
Seven attributed audit rows remain: six canonical evidence events and one
approved-Dexter event. The unchanged client Save creates no extra history.
The previous voided DG record remains retained, not reactivated.

All existing cargo, route, prior milestone and Quote-version rows retain their
pre-test full-row fingerprints from the development release evidence. Booking
header update time changes legitimately with successful evidence writes.
No console errors were captured in the observed Dexter tab. Brief duplicate
composer elements during New chat transitions resolved on fresh inspection;
no duplicate request was sent and no application patch was made for that state.

The hosted test covers Approve-mode creation, exact source data and one flag's
deterministic watch lifecycle. It does not certify hosted Full-access approval,
every correction/field, revoked-user or cross-project denial, ordinary-chat
watch handoff, or every mode. Their scoped local evidence remains separate.
All wider freight acceptance gates, recorded approvals and exclusions remain.
