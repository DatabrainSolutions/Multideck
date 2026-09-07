# Road board stage semantics — decision required

Read-only trace at checkout `2e4fb43`, 7 September 2026. This is part of the
remaining freight goal, not a completed Road stage implementation.

## Confirmed current behaviour

`RoadControlPage.moveRoadJob` updates only React rows and counts. Its Kanban
callback also substitutes a canned status/tone. Neither calls a persistence API.
Reloading uses the RLS-preserving bounded `multideck_road_control_page` read model,
which derives stages from `App_Live_Bookings.Progress` thresholds.

The live view definition was independently read through Supabase and matches
the relevant migration's progress expression:

| Saved condition | Progress | Resulting Road column |
| --- | ---: | --- |
| Closed date present | 100 | Financial close |
| Tracking status in_transit | 62 | Live movement |
| Tracking status delayed | 48 | Ready to plan |
| Draft | 8 | Intake |
| All other states | 24 | Intake |

Carrier confirmation requires 50–59, a range the view never emits. Delayed
shipments are placed in Ready to plan, regardless of where the delay occurs.
The Booking workspace independently displays 5/20/100 by lifecycle; that display
is not an alternative canonical Road stage writer.

## Consequential choice

Recommended: treat these as operator work queues with an explicit, audited
Road workflow stage, separate from tracking status, actual departure/delivery,
and financial close. A move changes the operator's queue only. Labels/help must
make that distinction clear, especially Live movement and Financial close.
Existing records need an explicit migration/initial-state policy; do not mark
carrier commitment, departure or invoice completion merely to populate a lane.

Alternative: make columns evidence-derived operational milestones. Then moves
must open the corresponding validated action and require its real data; a card
cannot simply be dragged into completion. Carrier commitment and close-out
requirements must be defined before implementing those transitions.

Do not implement a percentage writer, localStorage workaround, or mapping that
sets a shipment delayed to place it in Ready to plan. Do not treat disabling
drag alone as completing this gate. Preserve the bounded read/RLS design and
add matching Dexter read, approved-write, audit and deterministic-watch support
when an explicit stage capability is introduced.

No code, live records, tracking integration or Customs functionality changed
during this diagnosis. Product direction is requested before introducing new
stage semantics.
