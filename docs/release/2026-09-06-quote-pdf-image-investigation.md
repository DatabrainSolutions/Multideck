# Quote PDF image failure — 6 September 2026

## Outcome and release gate

The wrong logo source is corrected locally and covered by executable tests. **The PDF image failure is not fixed and this source correction has not been deployed.** Direct synthetic calls to the repository-documented Carbone server reproduce the broken image independently of the Quote workflow, database, mailbox and product layout. Inspect the document-server conversion process/configuration/logs before treating this as an application-template-only fault. A server owner/access pointer has been requested; no credentials were requested in chat.

Previous goal turn: progress (customer-response data boundary and branding deployed). This turn: progress (isolated hosted-renderer evidence changes the next diagnostic step; independent source mismatch corrected/tested locally). The broader freight objective remains active, including all-mode depth and end-to-end gates.

## Evidence

- Downloaded original issued JQ20022 PDF read-only from its actual `multideck-generated` bucket. SHA-256 is `040ba8b45ce631ec419fa623b0f26b5b7557fbbcd9112a1083621889d9fae2c5`. It is one page with a 14 × 16 embedded broken-image icon, not the intended logo. It was not regenerated/replaced.
- Legacy private logo is a valid 1081 × 1128 RGBA PNG with black colour channels and varying alpha, not a corrupt image. Stored MIME is `image/png`. Current saved Admin logo is a different SVG in `tenant-brand-assets`, MIME `image/svg+xml`.
- Direct calls to `https://docserver.multideck.app/render/template?download=true` used the existing server credential locally without printing it. All content was explicitly labelled synthetic software-test data. These calls did not use Quote send, create document catalogue records, contact customers or alter accepted evidence.
- Five successful PDF HTTP responses all contained the same 14 × 16 broken-image icon: production HTML with legacy PNG data URI; production HTML with current SVG data URI; production HTML with current public SVG URL; production HTML without the empty-logo CSS selector; and a minimal heading plus one PNG image with none of the Quote layout. The minimal result was rendered and visually inspected.
- An HTML-output call retained the exact legacy data URI byte-for-byte (35,642 characters). This rules out corruption in the application's initial base64/HTML substitution for that probe. It does not prove where inside PDF conversion the resource fails.
- Dynamic Carbone image-tag probes returned HTTP 500 with an invalid-document-XML error (current SVG twice, legacy PNG once). They were not adopted as a workaround. The documented server `/status` endpoint returned 403 with the available credential; access was not bypassed.
- PDF metadata identifies Chromium / Skia PDF m145. The actual Carbone server version/configuration is not established by this; a repository-pinned Studio version is not proof of the backend version.

Official [Carbone HTML image documentation](https://carbone.io/documentation/design/template-formats/html.html) supports both absolute URLs and data URIs. Its [configuration documentation](https://carbone.io/documentation/developer/on-premise-installation/configuration.html) describes the converter/download controls. The tests above justify inspecting that boundary; they do not identify a specific setting to change. No server upgrade, Nginx/security relaxation, Vercel change or alternate document engine was introduced.

Scratch probes and outputs: `/tmp/multideck-recipient-release.Qq7zZB/probe-quote-logo.mjs` and `QA-LOGO-*`. They are diagnostic intermediates, not issued/customer-ready documents. The script reads the existing local credential at execution; it does not contain the credential itself. Do not copy local environment files into reports or source control.

## Local correction

`quotePdfDataset` now uses the same saved Admin Branding configuration as the customer email/public page when version 1 branding exists. It downloads the selected object from `tenant-brand-assets` and embeds its bytes; no expiring URL is persisted in the document data. Legacy-only tenants retain the existing private template-source logo. Explicitly removing/resetting an Admin logo does not resurrect the old upload. Failure to download a selected current logo stops preparation rather than silently substituting another one.

The existing company-scoped brand lookup, permission checks, branding write path, immutable Quote versions and retained issued PDFs are unchanged. This only selects the branding asset for a future render. There is no new operational write/event capability to expose to Dexter; canonical document lifecycle reads/watches and approval-required send actions are unchanged. No recurring LLM work was added.

Validation: 21 focused tests pass, zero failures/skips, including four new production-dataset tests for selected SVG bytes, reset/removal precedence, legacy compatibility and failed-download behaviour. Full `quotes-workflow/index.ts` import graph passes Deno type checking with `--no-config --no-lock --node-modules-dir=none`. `git diff --check` passes. No fresh client build is claimed because no client source changed. No database migration, grants, RLS, Storage objects or live Edge Function changed in this checkpoint.

## Next actions

1. Inspect Carbone/Chromium conversion logs and effective configuration through approved server access; do not weaken authentication or file/network safety to make an image appear.
2. Repeat the minimal failing example, then the actual production renderer with current tenant SVG and legacy raster formats. Check actual PDF pixels/resources, not merely HTTP 200 or `%PDF-`.
3. Only after the renderer passes, release the local source correction through the controlled development process and prove a fresh preview/issued test PDF. Never overwrite the accepted JQ20022 PDF.
4. Continue independent revision/Booking and mode-depth work while this document-server gate is unresolved. This gate does not justify reducing the full goal or marking it complete.
