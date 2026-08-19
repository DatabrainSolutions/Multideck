-- Legacy reporting/work-queue views in the linked project were created as
-- owner-rights views and retained broad API grants. Anonymous requests could
-- therefore bypass the RLS-protected base tables. The current App and Edge
-- Functions do not use these views; retain service-role compatibility only.

begin;

do $$
declare
  v_view text;
begin
  foreach v_view in array array[
    'CRM_AIFocusAreaQueue',
    'CRM_AccountSalesSummary',
    'CRM_ActivityWorkflowRunSummary',
    'CRM_AppliedFieldUpdateAudit',
    'CRM_AutomationActionQueue',
    'CRM_AutomationPlaybookSummary',
    'CRM_BookingEngagementQueue',
    'CRM_CallActionAcceptanceSummary',
    'CRM_CallReviewTodoQueue',
    'CRM_CustomerKPIDashboard',
    'CRM_DataCaptureWizardQueue',
    'CRM_DataRequestQueue',
    'CRM_DataRequestResponseSummary',
    'CRM_FieldUpdateReviewQueue',
    'CRM_LeadKPIDashboard',
    'CRM_LeadWorklist',
    'CRM_MarketFeedbackSummary',
    'CRM_MessageRepetitionRisk',
    'CRM_NextBestActionQueue',
    'CRM_OnboardingWorklist',
    'CRM_PersonalMessageDraftQueue',
    'CRM_PipelineSummary',
    'CRM_PostCallReviewQueue',
    'CRM_QuickTaskOptionQueue',
    'CRM_SalesPitchImprovementQueue',
    'CRM_SalesRepKPIDashboard',
    'CRM_UserTodoQueue'
  ]
  loop
    -- These objects pre-date the current migration checkout, so a newly
    -- provisioned project may not contain them. Keep tenant provisioning safe
    -- while locking them down wherever they do exist.
    if to_regclass(format('%I.%I', 'public', v_view)) is not null then
      execute format(
        'alter view %I.%I set (security_invoker = true)',
        'public',
        v_view
      );
      execute format(
        'revoke all privileges on table %I.%I from public, anon, authenticated',
        'public',
        v_view
      );
      execute format(
        'grant all privileges on table %I.%I to service_role',
        'public',
        v_view
      );
    end if;
  end loop;
end;
$$;

commit;
