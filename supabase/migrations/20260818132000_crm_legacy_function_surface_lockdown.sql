-- Retire unused legacy CRM routines from browser roles. These pre-date the
-- current multideck_crm_* API, are not referenced by the App or Edge Functions,
-- and should not remain anonymous entry points. Pin their lookup path for any
-- controlled service-role compatibility that remains.
--
-- Explicit Dexter exception: these legacy automation/call/wizard routines are
-- not supported product capabilities. Dexter continues to use its allowlisted
-- current CRM adapters and must not regain access to these generic routines.

begin;

do $$
declare
  v_name text;
  v_function regprocedure;
begin
  foreach v_name in array array[
    'CRM_RecordActivity',
    'CRM_LinkQuoteToOpportunity',
    'CRM_CreateQuoteFollowup',
    'CRM_ConvertLeadToOpportunity',
    'CRM_AcceptCallActionCandidate',
    'CRM_CreateQuickTask',
    'CRM_CreatePersonalMessageDraft',
    'CRM_ApprovePersonalMessageDraft',
    'CRM_RecordQuickTaskDecision',
    'CRM_RegisterActivityWorkflowEvent',
    'CRM_StartAutomationRun',
    'CRM_CreateDataCaptureSession',
    'CRM_QueueFieldUpdate',
    'CRM_RecordWizardFieldValue',
    'CRM_CreateDataRequestFromRun',
    'CRM_RecordDataRequestFieldValue',
    'CRM_ApplyFieldUpdate'
  ]
  loop
    for v_function in
      select function_row.oid::regprocedure
      from pg_proc function_row
      join pg_namespace function_schema
        on function_schema.oid = function_row.pronamespace
      where function_schema.nspname = 'public'
        and function_row.proname = v_name
    loop
      execute format(
        'alter function %s set search_path = pg_catalog, public',
        v_function
      );
      execute format(
        'revoke all privileges on function %s from public, anon, authenticated',
        v_function
      );
      execute format(
        'grant execute on function %s to service_role',
        v_function
      );
    end loop;
  end loop;
end;
$$;

commit;
