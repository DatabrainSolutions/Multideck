# iCustoms procedure catalogue integration

Status: import dropdowns now include the dated iCustoms UI snapshot (81 unique
procedure codes and 105 additional-procedure codes). Provider synchronisation
remains blocked on a confirmed UK CDS reference-data API. No provider endpoint,
schedule or live sync has been added. Existing database options remain unchanged.
The bundled snapshot augments the client import lists only; exports are unchanged.
The UI labels the snapshot date and makes clear that it is not live-synced.

## Current evidence

On 14 September 2026, the iCustoms import item UI displayed 87 procedure entries
and 106 additional-procedure entries. These are observed UI entries, not verified
unique or universally applicable codes. Some procedure entries were duplicated
or had missing descriptions. Do not blindly import this list as an authoritative
CDS catalogue. At the user's request the displayed codes are now available as
selectable options, not as a claim of universal eligibility. Duplicates are
collapsed and the malformed lower-case `aaa` entry is excluded. Missing labels
are explicit; longer labels are abbreviated for display. Provider validation
remains authoritative. Source: `src/lib/customs-procedure-snapshot.ts` in the client.

The published documentation at https://ihub-tdr.customscloud.co/api/documentation
documents `/api/ros/v1/form-data` for ROS but no equivalent CDS catalogue route.
ROS data must not be substituted for UK CDS data.

## Implemented foundation

The client reads `sys_CustomsOptionCatalogue` using the existing authenticated
Supabase client and existing access rules. Reads are paginated in deterministic
code order, cached for five minutes, and published only after all pages and all
required catalogues load successfully. Direction-specific rows override shared
rows with the same code. Codes remain strings, preserving leading zeroes.
Failed or incomplete reads report an error and can be retried; they are not
presented as a successful refresh. The dated snapshot supplements only the two
import procedure lists after successful database loading. Remove this snapshot
merge when verified provider synchronisation is connected, so withdrawn codes
are not perpetually reintroduced.

## Provider information needed

Ask iCustoms for the supported UK CDS reference-data route for DE 1/10 procedure
codes and DE 1/11 additional procedure codes, including:

- Authentication, pagination, rate limits and sandbox/production availability.
- Full-list versus incremental response semantics and stable code identifiers.
- Import/export, declaration-category and procedure-combination applicability.
- Effective dates, withdrawn-code handling and source version/update timestamp.

## Next implementation once confirmed

Use the existing server-only iCustoms credentials and authenticated integration
boundary. Map the documented response to validated catalogue rows. Fetch every
page before atomically publishing a versioned snapshot; reject malformed,
incomplete or empty snapshots without deleting the last successful snapshot.
Refresh deterministically with bounded retries, not an LLM poll. Record source,
version, successful refresh time and refresh failures. Keep withdrawn codes on
existing drafts rather than silently rewriting user data.

Expose freshness and refresh failures honestly in the product. Keep catalogue
maintenance restricted to the backend; no browser credentials or arbitrary URL
configuration. Verify permissions and tenant isolation before deployment.

Dexter catalogue refresh/read/watch support is not introduced by this client-only
preparation. When the provider adapter is implemented, add evidence-backed chat
reads and deterministic catalogue-change events for Watching for you, or an
explicit unsupported response. Do not claim that automatic updates exist yet.
