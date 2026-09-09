# Supabase deployment — 2 September 2026

Target: **MultiDeck Development**, `aqtwypsuijxlnvtxpuxe`, eu-west-2. The target was confirmed from the linked checkout and live project metadata. No other tenant or Cloud project was deployed.

**Deployed: 10 database migrations and 30 Edge Functions.** All 30 function deployments are ACTIVE; readback matched the reviewed release snapshot for 182 bundled source files. This is backend deployment evidence, not a frontend deployment or a completed provider workflow.

## Applied migrations

Local migration names were matched against the remote ledger and actual schema. Historical migration versions differ, so a blanket database push or history repair was not used.

| Migration | Recorded remote version |
| --- | --- |
| user_default_inbox_provider | 20260902161551 |
| dexter_mistral_document_ocr | 20260902161553 |
| admin_usage_categories | 20260902161627 |
| lifecycle_note_owner_edits | 20260902161631 |
| cloud_support_ticket_dexter_parity | 20260902161632 |
| complete_workspace_ai_usage_metering | 20260902161633 |
| clarify_warehouse_customer_purchase_orders | 20260902161635 |
| calendar_booking_kinds_external_events | 20260902161637 |
| dexter_provider_email_actions | 20260902161831 |
| usage_watch_trigger_permissions | 20260902162132 |

The final permissions migration removes anonymous and authenticated EXECUTE from three usage trigger functions. They remain attached to the database event flow.

## Function deployments

| Function | Version | Gateway JWT verification |
| --- | ---: | --- |
| agent-dexter | 148 | Enabled |
| calendar-api | 16 | Enabled |
| calendar-public | 16 | Route-specific authentication |
| calendar-webhook | 13 | Route-specific authentication |
| calendar-worker | 16 | Route-specific authentication |
| contact-card-profile | 34 | Route-specific authentication |
| create-support-ticket | 57 | Enabled |
| customer-documents | 52 | Enabled |
| customers | 70 | Enabled |
| customs-invoice-ocr | 66 | Enabled |
| developer-broadcasts | 39 | Enabled |
| dexter-email-compose | 42 | Enabled |
| dexter-email-refine | 46 | Enabled |
| dexter-file-upload | 46 | Enabled |
| dexter-writing-profile | 48 | Route-specific authentication |
| email-oauth | 58 | Route-specific authentication |
| email-watch-worker | 70 | Route-specific authentication |
| email-webhook | 53 | Route-specific authentication |
| erpnext-webhook | 1 | Route-specific authentication |
| inbox-api | 104 | Enabled |
| quote-intelligence-worker | 33 | Route-specific authentication |
| quote-response | 33 | Route-specific authentication |
| quotes-workflow | 54 | Enabled |
| send-auth-email | 71 | Route-specific authentication |
| send-notification-email | 68 | Route-specific authentication |
| support-ticket-callback | 1 | Route-specific authentication |
| team | 67 | Enabled |
| tenant-branding | 17 | Enabled |
| transcription | 12 | Enabled |
| warehouse | 62 | Enabled |

The disabled gateway JWT entries preserve the existing callback, public-link and worker authentication designs; they do not imply unrestricted data access.

## Preserved newer deployed implementations

These are source regressions in the checkout, not pending upgrades. Their deployed versions were unchanged:

| Function | Kept version | Reason |
| --- | ---: | --- |
| bookings-workflow | 32 | Local source removes completion-readiness, complete and reopen actions. |
| document-studio | 50 | Local source removes template creation and PDF/Excel source support. |
| finance-subledger | 31 | Local source removes the deployed tenant-owned legal-entity selection safeguards. |
| screening | 39 | Local source replaces the deployed UKSL importer with the older OFSI implementation. |
| screening-list-worker | 41 | Local source replaces the deployed UKSL importer with the older OFSI implementation. |

## Verification

- Deno type checking passed for all 30 release entrypoints and their imports.
- 44 focused Calendar, Zoom, usage, lifecycle and security-remediation contract tests passed.
- Nine runtime tests passed for Calendar algorithms, account-score evidence and the support callback parser.
- 20 live HTTP probes returned expected results: 16 JWT-protected functions returned 401, Calendar worker and ERPNext webhook rejected unsigned calls with 401, an invalid public Calendar route returned 404, and the unconfigured support callback returned 503.
- Calendar host assignments, Cloud support signal/nonce tables and Dexter OCR uploads have RLS enabled and no direct anonymous or authenticated table reads.
- The three new usage trigger helpers deny direct anonymous and authenticated execution.
- The usage-category function executed against the live tenant and returned an object. The external-event read domain returned no records without an authenticated actor.
- Five Calendar database triggers remain connected to the Calendar watch adapter.
- The security-advisor snapshot had no ERROR findings, but did have WARN/INFO findings. Three new trigger-execution warnings were corrected and verified with live privilege queries. This is not a clean security-audit claim. [Advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- The broader existing contract run passed 762/787 tests. The 25 failures included outdated source assertions and existing workflow gaps. They were not suppressed or treated as a release-wide pass.

Deployment preparation fixed Calendar milestone typing, nullable Inbox reconciliation results, an invalid `.catch()` call on a PostgREST builder in suggestion cleanup, CRM lookup-map typing, Warehouse dashboard argument typing, and the support-callback test fixture. These changes passed the release checks above.

Authenticated end-to-end browser journeys, sending email, provider Calendar mutation, finance posting, actual webhook delivery and cross-project user-session tests were not performed. No customer messages were sent as a deployment test.

## Configuration still outstanding

- `support-ticket-callback` is deployed but not configured: `MULTIDECK_CLOUD_TENANT_ID`, `MULTIDECK_TENANT_HOST`, and `MULTIDECK_CLOUD_CALLBACK_PUBLIC_KEY` were absent from the target's secret-name list. Its 503 response correctly prevents ingestion. The current legacy support intake credentials remain present.
- `erpnext-webhook` is deployed but `ERPNEXT_WEBHOOK_SECRET` is absent. Unsigned calls are denied with 401. Provider callback registration and signed delivery are unverified.

## Historical migration reconciliation still outstanding

36 local migration names did not have an exact name/version match after excluding the migrations deployed here. **This does not mean all 36 should be applied.** Several are already represented by live objects or later migrations; the old fixture-backed quote/application tables are superseded by canonical operational tables.

Concrete unresolved groups include the old CRM pipeline indexes, CRM/Dexter essential actions, operational create/edit adapters, full Warehouse adapters and some Customs creation adapters. Their historical scripts overlap newer live definitions and registry state. They need a forward-only reconciliation that preserves current permissions and later behaviour, not replay in original filename order.

The old Inbox retention migration is also missing its retention columns and purge/compaction RPCs. It resets mailbox cursors and enables deletion of older indexed messages; it was not activated in this deployment. The deployed backfill worker references those missing RPCs, so this existing backfill gap remains. Live sync and provider-mail retention must be assessed separately.

The one-time invoice relevance recheck is not recorded under its local migration name; its effects must be reconciled with the newer relevance-v2/audit migrations before requeueing provider work.

Unmatched local migration names for follow-up:

- `202607290003_crm_pipeline_settings.sql`
- `202607290004_link_deals_to_tenant_pipelines.sql`
- `202607300001_user_profile_cover_and_job_title.sql`
- `20260731220500_user_keyboard_shortcuts.sql`
- `20260803152000_dexter_crm_essentials.sql`
- `20260804130000_inbox_automatic_reply_audit.sql`
- `20260805100000_inbox_twelve_month_retention.sql`
- `20260806112852_quotes_data_layer.sql`
- `20260806114105_application_live_data_foundation.sql`
- `20260807150000_fix_crm_drive_subfolder_rls.sql`
- `20260808120000_crm_update_deal.sql`
- `20260808130000_crm_update_lead.sql`
- `20260810180703_dexter_operational_create_edit_parity.sql`
- `20260811085329_contact_card_crm_field_mappings.sql`
- `20260811093000_dexter_customs_import_export_filing.sql`
- `20260811145223_dexter_full_warehouse_capabilities.sql`
- `20260812214215_customs_declaration_documents.sql`
- `20260812220112_idempotent_customs_rejection_recovery.sql`
- `20260812231500_customs_submission_accepted_snapshot.sql`
- `20260813194429_delete_customs_draft.sql`
- `20260813214500_dexter_icustoms_draft_start_parity.sql`
- `20260819150000_screening_all_matches.sql`
- `20260819160000_quote_reference_preferences.sql`
- `20260819170000_reference_patterns.sql`
- `20260819180000_add_quote_departments.sql`
- `20260819221701_fix_dexter_action_tool_schemas.sql`
- `20260820091915_crm_customer_supplier_organisation_register.sql`
- `20260820160000_customs_declaration_assignment.sql`
- `20260820163000_customs_transaction_nature_reference.sql`
- `20260820190000_hide_session_refreshes_from_detailed_audit.sql`
- `20260824153000_contextual_follow_up_recommendations.sql`
- `20260825090000_english_only_interface_locales.sql`
- `20260826110000_directional_quote_booking_references.sql`
- `20260828140500_quote_register_canonical_reference.sql`
- `20260830111301_finance_document_recovery.sql`
- `20260901193000_recheck_inbox_invoice_relevance.sql`

## Evidence location

Temporary predeployment source download, reviewed release snapshot, readback fingerprints, deployment logs and local check outputs: `/tmp/multideck-supabase-deploy-Cbl9C7`. This directory is local evidence and may be cleared by the operating system.
