# Hosted Air shipment-weight approval and watch checks

Development client `54d6da2`, Dexter 168, existing internal Booking JI0991132
(`78313622-1542-4aec-bbb2-c300a7ef5d57`). All mutations used the signed-in
operator interface; SQL was read-only evidence collection. No operational
shipment, financial or compliance decision was made.

## Approval and audit

Conversation `8041b3f6-9fd1-4c8f-b830-dc9438aa3b4c` read the exact Booking and
prepared action `c29759b6-e347-4516-9e5a-5d7aa4279f67` for
`update_booking_weight_override`. The proposal displayed the exact added value
`1500.987654321` kg and explained the separate override boundary. SQL confirmed
status prepared and unchanged null override/timestamp before approval.

The ordinary Approve button completed the action; SQL confirmed succeeded and
the exact persisted value. Event `dexter_weight_override_updated` attributes
before null, after `1500.987654321`, unit kg and the internal-test reason to
actor `4467c131-7068-4a7e-8ebc-e51d2d4af01c`. The UI showed completion and
removed the approval controls.

## Notification-only watch

Dedicated Watchers setup created `c7530387-1020-415c-8370-eb57ece6fe56`, titled
`QA Air shipment override changes`. Independently confirmed capability
`booking_shipment_value`, exact Job target, field `chargeableWeightOverrideKg`,
operator `changed`, and null ActionJSON. Initial trigger count was zero.

| Transition | Watch status | Cumulative events/alerts |
| --- | --- | --- |
| Approved override unknown → 1500.987654321 | Active | 1 |
| Cargo-line weight unknown → 0; override unchanged | Active | 1 |
| Override → unknown and cargo line → unknown | Paused | 1 |
| Override unknown → 0 | Resumed | 2 |
| Override 0 → unknown | Active | 3 |

Pause and resume were confirmed in SQL before subsequent changes. The UI alert
named JI0991132 and the exact saved before/after value. Detail displayed the
source-backed target, natural-language condition and event-driven checking.
Zero persisted as a real value; unknown remained null. Cargo-only editing did
not trigger the override watch. The final UI showed three alerts; SQL confirmed
three events and trigger count three.

## Final state and limits

Both shipment override and cargo-line weight are null again. The watch is
paused, retaining three events. All 38 Quote versions retain fingerprint
`48f5e0efb6d918d4019edbf8d9e47a28` with the prior full-row JSON method.
Audit/history is retained. No email or automatic action was configured.

This proves hosted Approve-mode read/prepare/approved-write/audit and one exact
override watch's matching/non-matching/pause/resume lifecycle. It does not prove
hosted replay, Full-access mandatory approval, cross-user/project denial,
every cargo field or multi-line case, or AWB/screening/full Air operations.
Those local matrices and remaining hosted gates are separate evidence. The
full freight goal, held Quote revision approvals and all exclusions remain.
