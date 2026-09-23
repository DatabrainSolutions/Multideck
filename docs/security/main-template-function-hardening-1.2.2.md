# Main Template function hardening, candidate 1.2.2

Restore reference: App `e02fef565ded8f42b4ca61233f544250394f5ed9`, release 1.2.1, Main Template `fqhlnorqcctomuxdjxpg`. The hosted template was healthy and contained no companies, App users, Auth users, jobs, uploaded objects or Vault secrets at the starting checkpoint. Do not apply this candidate without a current hosted backup/recovery point and renewed emptiness check.

The additive migration `20260923133528_harden_template_function_access.sql` changes **only EXECUTE grants**. It does not edit function bodies, ownership, triggers, policies, data or `search_path`.

| Function(s) | Before | After | Caller evidence |
| --- | --- | --- | --- |
| `_multideck_broadcast_watch_guard`, `_multideck_broadcast_watch_signal` | anon and authenticated EXECUTE | neither | Trigger-only; no App RPC caller |
| `_multideck_dexter_action_volume_alert`, `_multideck_dexter_crm_essential_signal`, `_multideck_dexter_egress_anomaly_alert`, `_multideck_dexter_lead_address_signal`, `_multideck_dexter_screening_signal`, `_multideck_dexter_security_event_notify` | anon and authenticated EXECUTE | neither | Trigger-only; no App RPC caller |
| `_quote_intelligence_header_changed`, `_quote_intelligence_job_cost_changed`, `_quote_intelligence_line_changed`, `_quote_intelligence_rate_changed`, `_quote_intelligence_watch_change` | anon and authenticated EXECUTE | neither | Trigger-only; no App RPC caller |
| `rls_auto_enable`, `sync_cmp_user_from_auth_user` | anon and authenticated EXECUTE | neither | Event-trigger/trigger return type; no App RPC caller |
| `reopen_rejected_customs_declaration(uuid)` | anon and authenticated EXECUTE | authenticated only | Signed-in customs correction uses this RPC; anonymous use is not legitimate |

`_crm_drive_has_permission(text)` and `_crm_drive_require_permission(text)` retain authenticated EXECUTE. CRM and private Storage policies call the former and signed-in CRM operations call the latter. Removing those grants could break legitimate Drive access. The five anonymous contact-card scan, view and submission RPCs retain their existing permissions.

## Lookup-path warnings deliberately deferred

The 64 functions below are all `SECURITY INVOKER` and have no per-function `search_path` setting. Their effective path is inherited from the caller, currently `"$user", public, extensions` in the hosted template. Some accept table names, call other routines without a schema prefix or use generated SQL. Setting a path is not a mechanical warning fix: it can change which object an existing call resolves. The empty template cannot exercise every legacy module. Each listed function therefore remains **unchanged** in 1.2.2 for the same specific reason: equivalent lookup and caller behaviour is not yet proven for that function. This is a documented deferral, not a claim that its warning is harmless.

- Audit_CurrentUserID
- Audit_DisableTableAudit
- Audit_EnableTableAudit
- Audit_LogBusinessEvent
- Audit_RecordAccessEvent
- Audit_RecordExportEvent
- Audit_SetContext
- CLM_AddClaimEvent
- CLM_AddReserveMovement
- CLM_CreateIncident
- CLM_LinkClaimFinancialDocument
- CLM_OpenClaimFromIncident
- CLM_UpdateClaimStatus
- Comm_CreateNotification
- Comm_LinkThreadRecord
- Comm_NormalizeAddress
- DOCB_FindAssetCandidates
- DOCB_FindLibraryPackCandidates
- DOCB_FindTemplateCandidates
- DOCB_SectionGridIssues
- DOCSEC_FindVerification
- DOCSEC_RecordVerificationEvent
- DOCSEC_VerifyDocumentHash
- EDI_QueueOutboundMessage
- EDI_RecordAcknowledgement
- EDI_RecordValidationIssue
- EDI_RegisterInboundMessage
- LOC_GetUTCOffsetMinutes
- LOC_LocalToUTC
- LOC_ResolveTimeZoneCode
- LOC_UTCToLocal
- LOC_UpsertRecordDateTimeContext
- MDX_CreateInboundReviewItem
- MDX_RecordDataChangeEvent
- MIG_RecordImportIssue
- OBS_EnqueueRetry
- OBS_RecordIntegrationEvent
- Portal_CreateRecordShare
- Portal_RecordAuditEvent
- RATE_CreateRateRequest
- RATE_CreateRateResult
- RATE_RecordAuditEvent
- RPT_RecordKPIResult
- SEC_RegisterCredentialReference
- SEC_UserHasPermission
- STU_ComponentPresets_version
- TCE_AddCaseDecision
- TCE_AddComplianceCheckItem
- TCE_AddScreeningSubject
- TCE_CreateComplianceChecklist
- TCE_CreateScreeningRun
- TCE_NormalizeName
- TCE_RecordIntegrationEvent
- TCE_RecordLicenseUsage
- TCE_RecordScreeningMatch
- TCE_RefreshChecklistStatus
- WMS_ApplyInventoryHold
- WMS_CreateBillingEvent
- WMS_FindOrCreateInventoryBalance
- WMS_PostInventoryTransaction
- WMS_RecalculateInventoryBalance
- WMS_ReleaseInventoryHold
- Workflow_FindDefinitionCandidates
- Workflow_GetReadyTasks

Rollback after a hosted migration must be additive. A corrective migration may restore the sixteen recorded grants; never erase an applied migration or force-push its commit. Release 1.2.1 remains the last verified release until the fresh install, actual workflows, hosted template and package checks pass.
