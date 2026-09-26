# Shared address entry

`LocationAutocomplete` supports editable text and multiline addresses, with optional saved address choices. `AddressSearch` enhances the existing address-line and postcode inputs: there is no separate finder. Typing edits that field only; selecting a suggestion populates the supported address fields for review. Both use the authenticated `address-search` function and public Photon/OpenStreetMap place data.

Labels follow the address country rather than the operator's UI locale: UK Postcode, US ZIP code and State, Canada Postal code and Province or territory, Australia Postcode and State or territory, Ireland Eircode, and Japan Postal code and Prefecture. The existing country formatter retains Japanese postal-first ordering where the form renders its full field set. Other countries use neutral Postal code and Region, state or province labels. Existing forms keep their supported storage fields; no synthetic missing address components are generated.

## Surfaces

- Events, calendar meetings and in-person booking links.
- CRM company/customer/supplier creation, lead creation, main addresses and operational addresses.
- Quotes: collection/delivery entry, party overrides, saved company-address choices and the add-address dialog.
- Bookings: new party addresses, party overrides and customs-readiness source addresses.
- Customs: importer, exporter, consignee, declarant, seller, buyer and representative address editors.
- Warehouse facilities; trips and mileage endpoints; team and company signature postal addresses.
- Both reusable components have interactive gallery entries and source/usage documentation.

Structured forms keep their individual fields for manual entry. The service does not infer missing streets or country codes from labels. Selecting another address clears missing address components rather than mixing two addresses. Names, contacts, legal identifiers, hours and other record data are not replaced. Main CRM inline addresses require confirmation before saving; other forms retain their existing save behaviour.

Saved organisation/office selectors retain their IDs and relationships. Read-only invoice addresses, email/IP/URL fields, rate zones, UN/LOCODEs, customs authorisation codes and warehouse bin codes are not geographic address inputs and are not replaced.

## Boundaries and recovery

Search requires a tenant-valid session and an active, company-linked internal profile, not an Events role. It does not read or write operational records; each form retains its existing write permissions. Only the typed query is sent to Photon. Anonymous, invalid-session, unlinked and inactive users are denied.

Queries are debounced by 180 ms, cancelled when stale, bounded to 3–240 characters and cached briefly. A bounded, user-scoped in-memory client cache avoids repeat network requests across forms for 60 seconds. Each worker caps bursts per user. The public Photon endpoint has no availability guarantee; configure `ADDRESS_SEARCH_URL` for a dedicated compatible provider as traffic grows. Empty results, outages and throttling never block manual address entry.

Dexter exception: public directory suggestions are transient input assistance, not verified evidence or saved records. Chat and Watching for you continue to use saved, reviewed addresses through existing record permissions. There is no third-party directory tool or watch, and no new automatic writes.

Verification: core/provider-shape tests, handler access/denial/recovery tests and the mandatory PostgreSQL access regression suite. Handler tests mock JWT verification; live unauthenticated denial and authenticated browser searches are separate integration checks.
