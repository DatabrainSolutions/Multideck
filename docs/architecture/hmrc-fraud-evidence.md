# HMRC VAT fraud-prevention evidence gate

Status: local design and support draft, 24 September 2026. No HMRC VAT API request is enabled by this note.

## Current request path

The operator's browser calls the tenant's Supabase Edge Function directly through `edgeFetch`; the App frontend host is not an intermediary for that request. OAuth start, callback, status and refresh exist, but no Edge route calls HMRC VAT obligations, submit-return or view-return endpoints. The protocol helper accepts a complete `WEB_APP_VIA_SERVER` header set and validates its shape. A separate server-only assembler takes only the five browser-reported fields, calls verified Auth helpers for the user and MFA fields, checks a fresh coherent ingress observation, and adds server-controlled product evidence. It ignores browser-supplied network, identity and vendor header names. Neither shape validation nor this assembler can attest the provenance of an alleged ingress observation; a deployment-specific verified adapter is still required.

A backend-only dispatch coordinator uses that assembler twice, before and after the database's one-way claim. It has no public route and requires an explicitly injected HTTP sender. The local fake-HTTP tests show that a failed preflight sends nothing, a lost claim response sends nothing, and every outcome after a committed claim remains blocking until a receipt or later readback is recorded. These tests do not validate real network provenance or HMRC acceptance.

A separate backend-only readback coordinator also requires complete assembled evidence and a guarded, service-only read of the claimed attempt's software-only period key. It records HMRC's raw 200 or 404 response through the database. Different figures are retained as mismatch evidence, and neither 404 nor a failed write authorises another submission. It is not exposed through a tenant route.

The obligation coordinator likewise assembles evidence and obtains only the scoped period dates and authority from server functions. It records one exact open obligation after the HMRC GET. No outbound obligation route is enabled until the ingress and licence evidence below is verified.

HMRC requires data for all 16 headers for this connection method. A missing value may be omitted or empty only after discussing the platform limitation with HMRC. Placeholder or inferred network and authentication values are unacceptable. The current request path has no verified source for several mandatory values, so the VAT API route must remain disabled.

| HMRC header | Intended evidence source | Current state |
| --- | --- | --- |
| `Gov-Client-Connection-Method` | Server constant for the verified browser-to-server path | Known value; route topology still needs a tenant check. |
| `Gov-Client-Browser-JS-User-Agent` | Browser collector on the actual operator request | Collector exists; it is not wired to a VAT API request. |
| `Gov-Client-Device-ID` | Persistent browser UUID | Collector exists; persistence and request binding need a live check. |
| `Gov-Client-Multi-Factor` | Verified software sign-in factor type, last successful prompt time and stable factor reference | A server-only helper can use verified Supabase `amr` TOTP time plus the sole verified TOTP factor ID to produce the value. It fails closed on stale or ambiguous evidence. No VAT API route calls it yet. |
| `Gov-Client-Public-IP` | Trusted ingress observation of the originating device | Edge header provenance and any intermediary chain are unverified for the tenant. Never accept a browser-supplied IP as proof. |
| `Gov-Client-Public-IP-Timestamp` | UTC capture time at the same trusted ingress as the public IP | Not captured together with a verified IP. |
| `Gov-Client-Public-Port` | Originating device's **public TCP source port** observed at trusted ingress | No verified source in the current Edge request API. `x-forwarded-port: 443` in Supabase's logging example is the HTTPS destination/server port and is expressly invalid for this HMRC field. Browser JavaScript cannot read its NAT-exposed source port. |
| `Gov-Client-Screens` | Browser collector | One current screen is formatted; multiple-screen collection and HMRC Test API acceptance are unverified. |
| `Gov-Client-Timezone` | Browser collector | Formatted locally; needs capture on the actual request. |
| `Gov-Client-User-IDs` | Authenticated tenant user ID and verified sign-in identifier from server-side identity | A server-only helper now cross-checks the verified JWT subject and email with the current confirmed Auth user, then percent-encodes the internal ID and login email. No VAT API route calls it yet. |
| `Gov-Client-Window-Size` | Browser collector | Formatted locally; needs capture on the actual request. |
| `Gov-Vendor-Forwarded` | Trusted public TLS hop inventory, from browser ingress through outbound service | Tenant ingress, intermediary IPs and chain order have not been verified. A client-provided forwarding header is untrusted. |
| `Gov-Vendor-License-IDs` | Actual product licence identifiers, hashed consistently, where present | The product's applicable licence model and source need confirmation. If there is no originating-device licence, ask HMRC how to represent the absence. |
| `Gov-Vendor-Product-Name` | Server-controlled product identity | Can be supplied after product name and encoding are fixed. |
| `Gov-Vendor-Public-IP` | Verified public IP on the first vendor TLS receiving hop | No tenant-specific verified value or trusted dynamic source. |
| `Gov-Vendor-Version` | Deployed App/Edge release identifier from server-controlled deployment metadata | No release metadata is bound to a request yet. |

## Evidence needed before an outbound sandbox request

1. In an isolated tenant test, inspect the actual headers and deployment network path at the Edge boundary. Establish which proxy sets each header, whether caller values are overwritten, the public client IP, source TCP port if exposed, public receiving IP and all public TLS hops. Log only safe diagnostics; do not log access tokens, VAT numbers, factor secrets or raw operator identifiers.
2. Wire `collectHmrcVatTotpEvidence` and `collectHmrcVatUserIds` only after validating the operator's JWT and identity on the same request. The MFA helper independently verifies JWT claims and obtains the user's factor list through the Supabase Auth admin API. The user-ID helper checks the confirmed Auth login email against that JWT and its subject. Require a recent TOTP event and exactly one verified TOTP factor; prompt again or stop if either condition fails. Other MFA methods and multiple TOTP factors need a separate source-backed mapping.
3. Define server-controlled product name, release/version and actual licence evidence. Confirm whether a device licence exists in this browser SaaS model.
4. Bind browser evidence to the authenticated request and implement an ingress adapter that proves the IP, source TCP port, capture time and complete public TLS hop chain together. Supply actual licence evidence and server release metadata. Pass these observations to the assembler only at the trusted boundary. Its local validation is not a substitute for that adapter. Keep the existing no-route gate until every required value has verified provenance.
5. Run HMRC's fraud-prevention Test API with the assembled headers, then an authorised sandbox obligations request; retain the correlation ID and a non-secret provenance record. Test denial for missing, forged and stale evidence and for another tenant.

## Draft question for HMRC support — do not send without authorisation

> We are implementing the VAT (MTD) API using the `WEB_APP_VIA_SERVER` connection method. The user's browser calls our tenant-specific Supabase Edge Function directly. We can collect browser device fields, and we are designing verified MFA, user and vendor evidence. The hosted Edge request interface currently has no verified way for our application to obtain the originating device's **public TCP source port**. The available `x-forwarded-port` example is `443`, the HTTPS server port, which your guidance says must not be sent as `Gov-Client-Public-Port`.
>
> For this topology, what evidence or approved treatment do you require if the platform cannot expose the originating public TCP source port? May `Gov-Client-Public-Port` be omitted or empty after your review, and what details should we supply for that review? Our browser SaaS has no known licence installed on the originating device; how should we handle `Gov-Vendor-License-IDs` if that is confirmed? We will not substitute a destination port, guessed port or placeholder. Please also confirm any required Test API procedure for this approved handling.

## Primary sources

- [HMRC web application via server header requirements](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/connection-method/web-app-via-server/)
- [HMRC guidance on missing fraud-prevention data](https://developer.service.hmrc.gov.uk/guides/fraud-prevention/getting-it-right/)
- [Supabase Edge Functions request and logging example](https://supabase.com/docs/guides/functions/logging)
- [Supabase Edge Functions architecture](https://supabase.com/docs/guides/functions)
- [Supabase Auth MFA and timestamped `amr` claims](https://supabase.com/docs/guides/auth/auth-mfa)
