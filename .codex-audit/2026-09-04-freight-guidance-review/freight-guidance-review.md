# Multideck Quote and Booking capability review

Review date: 4 September 2026

## Bottom line

The new guidance is directionally strong and can take Multideck from a good freight quote-and-booking product to an outstanding operating platform, but it should be used as a capability map rather than copied as a long field checklist.

Multideck is closer than the current screens make it appear. The live data model already has separate job parties, cargo lines, dimensions, dangerous-goods details, containers, route legs, route-to-cargo and route-to-container links, planned/estimated/actual milestones, versioned documents, tracking events, charges, declarations and quote versions. The weakest layer is now the presentation and workflow policy that decides which of those capabilities an operator sees for a given mode, direction, service and stage.

The correct next move is therefore not a schema rebuild and not twelve separate job forms. It is a controlled field-policy layer plus a calmer Booking Details information architecture.

## Evidence reviewed

- The supplied research brief: `/Users/leewright/Documents/Codex/2026-09-04/i/outputs/freight-management-screen-and-data-model-guidance.md`.
- Current Quote and Booking source code and contract tests.
- Current localhost Quote JQ20020 and Booking JE0991133 in the in-app browser.
- Read-only inspection of the configured MultiDeck Supabase project.
- Public, current material from CargoWise, DCSA, IATA, WCO, IMO, UNECE, CIT Rail and Descartes BoxTop.
- A focused suite of 53 Quote/Booking contract tests; all 53 passed.

Limits: CargoWise operational screens are customer- and configuration-specific and are not fully public. The comparison is therefore based on public product capabilities and industry standards, not an attempt to reproduce a private CargoWise setup. The local tests are mainly source and database contract tests; they are useful guards but are not a substitute for end-to-end user-flow testing.

## Where Multideck stands now

### 1. Quote drafting and commercial structure — strong

The Quote workspace already separates Overview, Details, Quote charges, Documents, Notes and Audit. It supports customer, payer, shipper, consignee, overseas agent, mode, branch-relative direction, shipment type, Incoterms/scope, collection/delivery/customs scope, multiple container requests, multi-leg routing, supplier/carrier alternatives, cargo characteristics, charges and customer terms.

Autosave remains the mutable draft boundary. Submission creates the historical version boundary. This is the correct commercial model and should not be disturbed.

### 2. Quote versioning and customer response — strong

The agreed decisions are present in the live schema and current code: mutable drafts, immutable submitted versions, changes-requested status, manual or secure-link acceptance, PDF retention, one active response link, follow-up policy, version naming, customer-change/new-master handling and audit records.

The inspected live example contains a submitted V1 with `changes_requested`, a submitted accepted V2, and a Booking applied to V2. That is real evidence that the intended lifecycle is represented in the database, not just mocked in the interface.

### 3. New-version-to-existing-booking control — strong foundation

The current contract includes:

- an out-of-sync review rather than an automatic overwrite;
- field-by-field application plus Apply all;
- comparison of the previous quote, current booking and proposed quote;
- a mandatory confirmation for mode changes;
- preservation of booking-only operational legs and records;
- master quote reference plus applied and proposed version visibility;
- audit events and booking notification links.

This is one of Multideck's strongest foundations and is more valuable than adding another dozen visible fields.

### 4. Universal operational data model — stronger than the UI

The live model already supports most of the research brief's universal-job proposal:

| Domain | Present now | Main gap |
|---|---|---|
| Job header | Mode, direction, locations, dates, tracking, source quote/version, sync state | More of the typed data is not yet presented consistently |
| Parties | Generic role-based job parties plus a broad role dictionary | UI still centres on a fixed Customer/Payer/Shipper/Consignee set |
| Routing | Multiple legs, per-leg mode, carrier, terminals, transport references and planned/estimated/actual times | Only a compact subset is editable in Booking Details |
| Cargo | Multiple cargo lines, dimensions, declared value, HS/origin, dangerous goods and temperature control | Main Details UI edits only the first cargo line as a summary |
| Equipment | Containers, seals, VGM, reefer settings, ownership and route allocation | Current container rows expose only a small operational subset |
| Milestones | Per-route planned, estimated and actual milestones plus linked tracking events | No complete mode/direction milestone template experience yet |
| Documents | Versions, current-version flag, metadata and links to other records | Document workflows need more mode-specific document readiness |
| Tracking | Events can link to route, cargo or container and retain raw/normalised evidence | Provider connection and operator-facing tracking flow remain future work |
| Charges/customs | Dedicated charge and declaration structures | Needs full cross-mode workflow validation, not another duplicate Details section |

### 5. Conditional mode/direction behaviour — the largest product gap

The screens have individual conditionals, such as Sea container visibility, mode-filtered shipment types, mode-specific route transport labels and a small number of country-specific fields. There is no single, auditable policy that controls visibility, requiredness, labels, source ownership and quote-to-booking sync by mode, direction, service and stage.

That causes the visible clashes:

- Sea Booking Goods still shows Air-oriented `Chargeable weight` and Road-oriented `VIN` fields.
- Common fields are repeated in the summary strip, Job data and Route & service.
- A submitted Quote is presented as a very long disabled form instead of a calmer immutable summary.
- Live dictionaries contain Multimodal, Courier, Warehouse, Transit and other categories that are not surfaced consistently across Quote and Booking controls.
- Flexible JSON fields are useful for compatibility, but important operational fields should not drift into unvalidated JSON when a stable typed structure exists.

### 6. Information density — functionally capable, visually overloaded

At the inspected viewport, Booking Details contains roughly 3.5 screens of vertical content, 15 section headings and 145 visible controls. Quote Details contains roughly 3.6 screens, 11 section headings and 197 visible controls; because the chosen version is submitted, 182 of those controls render disabled.

The product remains visually consistent, and the tabs, labels and accessible names are generally sound. The risks are scanning fatigue, loss of context, repeated fields, extensive sub-12px supporting text and a disabled-form appearance that makes historical Quotes harder to read than they need to be.

### 7. Release confidence — not yet 100%

The focused 53-test suite passed and the September Quote/Booking migrations are present in the configured live Supabase project. However, the current branch is 23 commits ahead of its remote and the working tree contains substantial uncommitted work. The passing tests are primarily contract checks. Until the changes are committed, pushed, deployed and exercised through a complete browser-to-database customer lifecycle, the system should not be described as fully locked down.

## What the external research confirms

CargoWise publicly describes one platform across modes and borders, with workflow templates configurable by mode, lane, direction or customer. It also treats schedules, bookings, documentation, carrier connections, milestones and exceptions as parts of one connected flow. This supports the guidance's universal-job direction rather than separate screens for every combination.

DCSA Booking 2.0 explicitly classifies data as mandatory, conditionally mandatory or optional per use case. That is the strongest standards-based justification for building a field policy rather than displaying every possible field.

DCSA's current Industry Blueprint separates shipment, equipment and vessel journeys while keeping them connected. Multideck's existing split between cargo, containers, routes and milestones is already aligned with that pattern.

IATA ONE Record defines a shared air-cargo data model and a single-record view across participants. WCO's Data Model provides harmonised reusable data definitions for customs, including import, export and transit. UNECE eCMR and CIT Rail confirm that Road and Rail need their own consignment-document and transport references rather than Sea/Air labels reused everywhere. IMO's VGM rules justify structured container VGM handling for Sea FCL.

## Recommended screen architecture

### Quote

Keep the existing top-level tabs:

`Overview | Details | Quote charges | Documents | Notes | Audit`

Do not fragment the Quote into many operational tabs. A salesperson benefits from seeing the commercial story together. Within Details, use a compact sticky section navigation or progressive disclosure for:

1. Commercial setup
2. Parties
3. Route and service
4. Cargo and equipment
5. Terms

For submitted versions, replace the disabled-form treatment with a readable immutable summary and a clear `Create new version` action. The underlying snapshot remains unchanged.

### Booking

Keep the existing top-level tabs:

`Overview | Details | Documents | Customs | Finance | Notes | Audit`

Do not copy the research brief's Documents, Customs and Charges tabs inside Details because Multideck already has those as top-level workspaces. Add four sub-tabs inside Details:

1. **Control** — job status, owner, references, commercial scope and payer terms.
2. **Parties** — customer, payer, shipper, consignee and optional role-based parties.
3. **Route & schedule** — service, routing legs, carriers, transport references and planned/estimated/actual dates.
4. **Cargo & equipment** — cargo lines, dimensions, dangerous goods, containers/ULDs/vehicles/wagons and allocation.

Keep the compact route/status summary visible above those sub-tabs so the operator never loses job context.

Add Tracking as a top-level workspace only when the Sinay/live-tracking flow is ready. Planned, estimated and actual times should remain separate so original planning and performance analysis are preserved.

## The mode and direction rule to lock

Use four normal commercial directions: Import, Export, Domestic and Cross trade. Continue calculating them relative to the operating branch/company jurisdiction. Do not revert to an origin/destination label that ignores the branch.

Keep `Transit` in the data dictionary for genuine customs-transit jobs, but do not infer it from geography and do not place it beside the four ordinary directions without context. It should be an explicit specialist choice. `Transshipment` is a route-leg type or milestone, not the overall commercial direction.

Mode controls the transport vocabulary:

- Sea: FCL/LCL, vessel/voyage, ports/terminals, containers, seals, VGM, cut-offs, bill of lading and equipment return.
- Air: MAWB/HAWB, airline/flight segments, pieces, gross and chargeable weight, dimensions, ULD, screening and special handling.
- Road: FTL/LTL/groupage, pickup/delivery stops, vehicle/trailer/driver, appointments, CMR and POD.
- Rail: train/service, operator, terminals, wagon/container, CIM/CIM-SMGS references and border hand-offs.
- Multimodal: one commercial job whose individual route legs each carry their own mode-specific fields.

Direction then overlays the commercial/customs workflow; service overlays capacity/equipment requirements; stage controls when a field becomes visible or mandatory.

## What should not change

- The master Quote number and submitted version history.
- The mutable-draft versus immutable-submission boundary.
- Secure-link and manual acceptance options.
- The rule that Booking edits never overwrite a Quote.
- The approval review before a newer accepted Quote updates an existing Booking.
- Field-by-field and Apply all update choices.
- Audit preservation of older Quote PDFs, booking documents and prior operational values.
- Branch-relative Import/Export/Domestic/Cross-trade direction.
- Planned versus estimated versus actual event history.

## Honest completion estimate

These are product estimates, not measured delivery percentages:

- Agreed Quote versioning and Quote-to-Booking commercial lifecycle: **about 85%**. The main remaining work is full end-to-end proof, release control and any edge cases exposed by that test.
- Universal Booking data foundation: **about 75–85%**. Most important structures exist.
- Mode/direction/service/stage presentation policy: **about 35–45%**. The key rules are still scattered and incomplete.
- Operational mode depth: Sea **about 55–65%**, Air **about 35–45%**, Road **about 30–40%**, Rail **about 20–30%**.
- Overall journey from the current product to a polished, standards-aligned all-mode operating platform: **roughly halfway**. This is not a rebuild; it is a substantial productisation layer over a capable foundation.

## Prioritised micro-steps

1. **Freeze the current commercial invariants.** Write one short canonical flow and one end-to-end scenario list for Quote draft, submission, response, conversion and later-version Booking update. Do not change code in this step.
2. **Create the field-policy matrix.** For every field record: mode, direction, service, stage, visibility, requiredness, label, source of truth, edit owner, customer visibility and Quote-to-Booking sync rule.
3. **Approve the Booking Details information architecture.** Prototype Control, Parties, Route & schedule, and Cargo & equipment using the current screen and current components.
4. **Introduce one central policy resolver.** Existing screens consume it; no separate Sea/Air/Road forms.
5. **Complete Sea rules first.** FCL/LCL, container/VGM/cut-off/document/milestone behaviour, including Import, Export and Cross trade.
6. **Complete Air rules.** AWB, flight segments, ULD, chargeable weight, screening and Air milestones.
7. **Complete Road rules.** Domestic and cross-border terminology, CMR, stops, vehicle/driver and POD.
8. **Add Multimodal and specialist Transit handling.** Reuse the same route-leg model.
9. **Treat Rail and consolidation as controlled extensions.** Build them after confirmed customer demand or after the core three modes are proven.
10. **Run the real victory test.** Browser-to-Supabase scenarios, permissions, documents, audit, retries, concurrency, deployment parity and post-deployment smoke tests.

## Final judgement

Yes, this direction can take Multideck from great to outstanding. The differentiator will not be matching CargoWise field-for-field. It will be retaining CargoWise-level operational structure while giving smaller and mid-sized forwarders a much calmer interface, safer Quote versioning, clearer customer acceptance, and a mode-aware workflow that reveals complexity only when it matters.

The biggest mistake would be adding every field from the research document directly to the current long screens. The strongest move is to turn the document into a tested field policy and let the already-capable data model power a simpler experience.

## Sources

- [CargoWise International Forwarding](https://www.cargowise.com/solutions/cargowise-forwarding/)
- [CargoWise Schedules and Bookings](https://www.cargowise.com/solutions/cargowise-forwarding/schedules-and-bookings/)
- [DCSA Booking 2.0](https://dcsa.org/standards/booking/documentation-booking-2/booking-2-introduction)
- [DCSA Industry Blueprint 2026.Q1](https://reference.dcsa.org/content/standards/industry-blueprint/v2026-q1/industry-blueprint-2026-q1)
- [DCSA Track and Trace](https://dcsa.org/standards/track-and-trace/standard-documentation-track-and-trace)
- [IATA ONE Record](https://www.iata.org/one-record/)
- [WCO Data Model](https://www.wcoomd.org/DataModel)
- [IMO Verified Gross Mass](https://www.imo.org/en/ourwork/safety/pages/verification-of-the-gross-mass.aspx)
- [UNECE eCMR D24A](https://unece.org/trade/documents/2024/12/standards/ecmr-d24a)
- [CIT Rail forms](https://cit-rail.org/en/freight-traffic/products/forms/)
- [Descartes BoxTop](https://www.descartes.com/boxtop)
