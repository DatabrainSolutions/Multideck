# Connecting App to central Multideck Live

Each company keeps its App domain and dedicated operational Supabase project.
Central `multideck.live` connects using that App's descriptor and a dedicated
integration credential. This implements the product-owner clarification of
8 September 2026; a separate Live deployment per company is no longer the target.

## Endpoints implemented in this batch

- `https://{company}.multideck.app/.well-known/multideck-live.json`: public,
  opt-in descriptor with App origin, workspace slug, project reference, gateway
  address and implemented operations. It contains no key or customer records.
- `https://{project}.supabase.co/functions/v1/live-company-gateway`: signed,
  server-to-server POST endpoint for `warehouse.context`, `warehouse.stock`
  and `warehouse.products`. Other operations return 501 until implemented.

Central Live must fetch the descriptor from an approved company App URL, check
the returned origin against that URL and pin the project/gateway before saving
the connection. An App website URL is not itself a Supabase RPC address.

## Configuration and identity

After applying the warehouse prerequisites and migration
`20260908030000_live_company_gateway.sql`, provision reviewed records in
`private_live_gateway.connections`, `keys` and `customer_grants`. All are disabled
by default and inaccessible to browser roles. The grant binds a central Live
subject and connection to one App organisation and an explicit warehouse set;
effective warehouses also require current App customer/facility access.

The connection and grant IDs must match central Live's private membership
records. Do not create App Auth users or reuse unrelated tenant user IDs to
make the mapping pass. Dedicated integration secrets must be independently
generated with at least 256 bits of entropy, stored centrally in encrypted
server-side storage and on this App as the `LIVE_GATEWAY_KEYS` Edge secret:
an object mapping a key ID to its secret. No secret belongs in a VITE variable.
The database key record independently supports enable/disable and expiry.
Rotation adds a new key ID and revokes the old one after a controlled transition.

Deploy the Edge Function with the checked-in `verify_jwt = false` configuration:
the handler verifies its dedicated HMAC protocol, not a cross-project Supabase
JWT. Configure App public build variables `VITE_LIVE_GATEWAY_ENABLED=true`,
`VITE_MULTIDECK_TENANT_SLUG`, `VITE_MULTIDECK_TENANT_HOST`,
`VITE_SUPABASE_PROJECT_REF` and `VITE_SUPABASE_URL`. Discovery fails the build if
hostname, slug and backend disagree. Enable discovery only after the gateway is
configured and verified. No deployment/configuration is performed by this commit.

## Authentication and replay protection

The version-1 envelope and HMAC bytes match central Live's company-gateway
transport. The signature binds POST, project audience, fixed gateway path, key
ID, Unix timestamp, nonce and exact body SHA-256. Requests expire after two
minutes. Body streaming is capped at 64 KiB. The database atomically checks the
active key, connection, grant and subject, consumes the nonce and reads scoped
data. Successful read request records retain source key, subject, grant, operation
and time; duplicate nonces return conflict. Secrets and raw upstream diagnostics
are never returned. Grant/key edits take effect on the next request.

## Evidence and remaining work

Local tests cover public descriptor identity/secret exclusion, HMAC verification,
wrong-project signatures, altered subjects, unsupported writes and replay routing.
The Live SQL test executes an exact copy of the App migration on a synthetic
WMS fixture: scoped reads succeed, wrong connection/key/subject/facility and
revoked keys fail, and repeated nonces conflict. These are local checks, not
hosted cross-company acceptance.

Remaining: audited key/grant administration, the central Live connection screen
and descriptor registration, routing current Live screens through these grants,
order reads/writes and product writes through App's existing lifecycle, and
hosted two-company/revocation verification. The existing co-located Live API
must not be described as already using this remote gateway.

Dexter exception: integration secret/grant administration and central customer
chat/watch are not exposed through Dexter. Existing operator stock/product
domains and deterministic watches continue unchanged. This read-only gateway
does not enable physical operations or add a new operational event.
