# Customer support ticket connection

`create-support-ticket` is called by a signed-in user inside one isolated
Multideck customer project. It derives the reporter from that project's Auth
user and `cmp_Users` record, then sends the ticket to Multideck Cloud.

## Customer-to-Cloud authentication

Each customer project has its own Ed25519 key pair:

- `MULTIDECK_CLOUD_SUPPORT_SIGNING_PRIVATE_KEY` contains the PKCS8 private key
  and exists only in that customer's Supabase Edge Function secrets.
- `MULTIDECK_CLOUD_SUPPORT_KEY_ID` identifies the public key registered in
  Cloud, for example `jenkar-support-2026-09`.
- Cloud stores the matching SPKI public key. The public key can verify a ticket
  but cannot create one.
- The signature includes the timestamp, one-use nonce, ticket-body digest,
  exact tenant hostname, and key ID. Moving a signed request to another customer
  therefore fails.

The private key must never be placed in browser variables, Git, logs, tickets,
Cloud tables, or documentation. Rotate a key by registering a new public key in
Cloud before replacing the customer secret, then verify a harmless ticket.

The customer function remains JWT-protected and independently calls
`auth.getUser()`. Cloud ticketing is enabled only by the server-side
`MULTIDECK_CLOUD_SUPPORT_ENABLED=true` flag.
