# Hosted screening approval and watch evidence

Development client `7947c01`, Booking v46 and Dexter v169. All mutations used
the authenticated Chrome UI; SQL was read-only verification. Internal Booking
`JI0991132`, job `78313622-1542-4aec-bbb2-c300a7ef5d57`, retained QA cargo 2
`35b0dfa1-c72b-422b-92f3-f15408b4a3cd`. Nothing represents actual screening,
clearance, agent verification or an AWB.

## Read, deny, approve and audit

Conversation `35d6bdb8-887c-4476-aead-2a625687a6b5` prepared new evidence.
The first proposal `41e199ab-caa2-4bc0-bc42-3c8c75ea221b` preserved the three
field values but appended instructions to the reason. It was denied through
the UI; SQL confirmed `declined`, no approval timestamp and no inserted record.
This is a recorded reason-fidelity limitation of the original prose request,
not silently counted as an exact successful proposal or a corrected product bug.

A follow-up explicitly delimited the reason and required no additions. Action
`d8540bfd-7a99-464e-b2ad-c4f8247ac8fc` then showed the exact source values and
reason. Before approval, SQL confirmed `prepared`, null approval timestamp,
current Booking/cargo stamps and still only the older voided evidence.
The ordinary Approve button produced `succeeded`, approval time
`2026-09-07T15:04:36.481718+00:00`, and new evidence
`f1494411-2199-48bb-91f2-8cc7015d7aaf` with exact:

- Security status: `INTERNAL QA DEXTER — NOT CLEARANCE`.
- Source: `INTERNAL QA Dexter screening lifecycle 2026-09-07 — synthetic, not a shipment`.
- Notes: `No screening performed. Internal approval and watch verification only.`
- Reason: `Internal hosted Dexter screening approval verification; retain history and void test evidence after checks.`

Both `cargo_security_evidence_recorded` and `dexter_security_evidence_recorded`
events preserve that reason and actor `4467c131-7068-4a7e-8ebc-e51d2d4af01c`;
the latter identifies entry point `dexter`. UI showed the approved save completed.

A separate read-only prompt returned exact `recordStatus`, `securityStatus`,
`sourceReference` and `operatorEditable` for the new active entry and older
voided entry `3b155b97-5fba-4f8b-b07a-d163b9849e10`. Results matched SQL,
including true versus false editability. A fresh operator tab also displayed
the approved entry on the correct cargo before subsequent changes.

## Exact notification-only watch

Dedicated Watchers setup created `a27a75fc-3e5c-4a49-b26b-526e59ef23b0`,
`QA screening source changes`. SQL confirmed capability
`booking_security_evidence`, exact new evidence ID, source-backed label
`JI0991132 · Cargo 2 · Screening evidence`, field `securityStatus`, operator
`changed`, and null ActionJSON. No email or automatic action was configured.

| Saved change | Watch state | Cumulative alerts |
| --- | --- | --- |
| Notes only; security status unchanged | Active | 0 |
| Status to `INTERNAL QA DEXTER — MATCH TEST, NOT CLEARANCE` | Active | 1 |
| Status to `INTERNAL QA DEXTER — PAUSED TEST, NOT CLEARANCE` | Paused | 1 |
| Status to `INTERNAL QA DEXTER — RESUMED TEST, NOT CLEARANCE` | Resumed | 2 |

Pause and resume were independently verified before their test changes.
Database trigger counts and UI alerts agreed. Detail showed exact before/after
source values, correct Booking/cargo, and event-driven checking. No health
error was returned; the health status remained `starting` in the observed
early checks, so a healthy-status badge is not claimed.

## Final state and limits

The watch is PAUSED with two retained alerts and null ActionJSON. Both synthetic
screening records are VOIDED, with source/history retained. All 38 Quote
versions retain full-row JSON-ordered fingerprint
`48f5e0efb6d918d4019edbf8d9e47a28`. No source code, deployment settings,
Customs/iCustoms, held Quote revisions, or deferred feature was changed.

This proves hosted Approve-mode preparation/denial/approved save, exact read-back,
audit, selected-field nonmatching silence, matching once and pause/resume.
It does not prove hosted Full-access mandatory approval, replay/stale conflict,
fractional-time entry, cross-user/project denial, no-op resubmission, watch
source-link navigation or general natural-language reason fidelity. Those
remain separate gates alongside wider Air/AWB and all-mode acceptance.
