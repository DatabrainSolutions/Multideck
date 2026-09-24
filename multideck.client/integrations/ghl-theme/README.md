# Multideck CRM brand

Brand: **Multideck**. Browser entry point: **https://crm.multideck.app**.

This is a separate HighLevel brand under the existing Databrain Solutions agency. The owner explicitly selected a separate brand on 15 September 2026; do not replace Flair's domain, CSS, JavaScript or existing brand assignments.

## Files

- `multideck-crm.css`: readable theme source, version 0.1.1. The installed CSS is a whitespace-compacted equivalent.
- `multideck-logo.svg`: unchanged canonical full logo from `src/assets/brand/multideck-full-logo.svg`.
- `multideck-mark.svg`: unchanged canonical mark for surfaces that support an icon.
- `preview.html`: standalone illustrative design harness, not a HighLevel clone or evidence of live workflow support. Its sample records never enter App or GHL.

Source design: root `design.md`, `src/styles.css`, and `docs/agent-policies/branding.md`. The theme uses light Multideck neutrals, teal `#0a7068`, the app's system sans-serif font stack, 6px control corners and 10px panel corners. It contains no external code, tracking, credential handling or tenant routing.

## Live setup and verification, 15 September 2026

- Separate Multideck brand created in Agency Settings → Company → White Label.
- Owner completed GoDaddy connection. HighLevel recorded `crm.multideck.app`; HTTPS login was opened successfully.
- HighLevel supplied CNAME `crm` → `whitelabel.ludicrous.cloud`.
- Version 0.1.1 CSS saved in the **Multideck** brand's Custom CSS field; Custom JS remains empty.
- Live login visibly renders the teal action, neutral background, system type, revised fields and panel corners.
- Keyboard navigation from email to password and email-required feedback checked without submitting credentials.
- Local CSS parsed successfully with PostCSS (39 rules); whitespace check passed.
- Logo upload pending browser extension file-URL permission.
- Authenticated CRM screens and sub-account assignments pending. Current agency list contains Databrain Solutions and Jenkar Shipping (paused); neither was reassigned during this work.
- Mobile verification remains pending: the browser viewport capability did not change the actual 1920px viewport. Do not count that attempt as a mobile pass.
- Brand contact email, phone, legal policy URLs and optional API domain have not been invented or populated.

## Applying and maintaining the theme

1. Open Agency Settings → Company → White Label and select **Multideck**. Confirm the domain is `crm.multideck.app` before saving anything.
2. Upload the canonical logo and save its branding section. Preserve its aspect ratio and transparent background.
3. Save the CSS into this brand's Custom CSS field. The live editor accepted plain CSS; do not add a remote theme-builder import or copy Flair's scripts into this brand.
4. Assign only explicitly identified Multideck sub-accounts and SaaS plans to this brand. A common browser domain is not proof of a tenant's brand assignment.
5. Reopen the branded domain and test login, recovery, sub-account navigation, contacts, conversations, opportunities, calendars, marketing and settings before calling the whole CRM themed.
6. Recheck after GHL UI updates. Its custom CSS facility is not a stable supported design-system API.

Keep old CSS before each later release. To roll back this first theme, select **Multideck**, clear only its Custom CSS and save. Its original CSS was empty. Do not remove the brand or domain, and do not touch the default Flair brand. Revert later releases by restoring the last verified CSS.

## Coverage boundaries

The current CSS covers inspected sidebar/header and login selectors plus common HighLevel control families. It preserves navigation, security controls, validation semantics and status colours. Shared control selectors still need verification on each authenticated workspace.

CSS in the host page cannot reliably style cross-origin embedded tools. Native mobile apps, generated PDFs, email content, customer websites, funnels and drag-and-drop builders have separate branding mechanisms. They are not claimed as completed by this theme. Public customer outputs retain their explicit tenant-branding rules; internal CRM and authentication use Multideck identity.

HighLevel's native language menu remains present. This work adds no translated interface strings. Default QA language is English; no personal OS colour scheme is imported by this theme. Dark-mode support is not claimed.

## Luke / Multideck.Cloud contract

Cloud remains the control plane; implementation of provisioning belongs in `DatabrainSolutions/Multideck.Cloud`, not in this App theme folder.

When Luke adds GHL provisioning, it should record the provider's actual **Multideck brand ID** and each tenant's GHL location ID, apply the brand to each new Multideck location, and verify the saved assignment. Obtain the actual IDs from the supported provider interface; do not derive them from names or domains.

Track the shared CRM origin, theme version, domain/certificate state, location mapping, assignment outcome and retryable provisioning step in Cloud. Credentials remain server-side. A theme or brand selection must never grant access or select an App Supabase project. Each App tenant retains its own complete Supabase project and operational data.

A failed brand assignment must remain visible in Cloud and must not mark provisioning complete. Use an idempotent retry instead of creating another location. Future tenant acceptance should include a branded login, correct location, expected navigation and separate checks for actual access isolation.

## Provider references

- [HighLevel company and white-label settings](https://help.gohighlevel.com/support/solutions/articles/48000982604-agency-company-settings-in-highlevel)
- [HighLevel multiple brands](https://help.gohighlevel.com/support/solutions/articles/155000008349-saas-multi-brands-overview)
- [HighLevel white-label domain setup](https://help.gohighlevel.com/support/solutions/articles/48000982207-white-label-the-desktop-app)

These describe configuration capabilities, not proof that every tenant or embedded surface has been verified.
