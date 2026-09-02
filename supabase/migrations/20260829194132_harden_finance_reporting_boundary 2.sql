-- Legacy finance reporting views had broad execution with owner privileges.
-- Keep them available to the tenant's protected service boundary, but make
-- underlying RLS apply to every caller and remove browser-role access.

begin;

alter view public."FIN_AccountingDateWorklist" set (security_invoker = true);
alter view public."FIN_CutoffRunSummary" set (security_invoker = true);
alter view public."FIN_WIPAccrualSummary" set (security_invoker = true);
alter view public."FIN_DocumentBalanceSummary" set (security_invoker = true);
alter view public."FIN_JobFinanceSummary" set (security_invoker = true);
alter view public."FIN_JobChargeFinanceSummary" set (security_invoker = true);
alter view public."FIN_ROEWorklist" set (security_invoker = true);
alter view public."FIN_JobROESummary" set (security_invoker = true);
alter view public."FIN_FXGainLossSummary" set (security_invoker = true);
alter view public."FIN_CashAllocationSummary" set (security_invoker = true);
alter view public."FIN_DebtChasingQueue" set (security_invoker = true);
alter view public."FIN_CommissionAccrualSummary" set (security_invoker = true);
alter view public."FIN_ProfitShareSummary" set (security_invoker = true);
alter view public."FIN_ExportReadinessQueue" set (security_invoker = true);
alter view public."FIN_AIInsightQueue" set (security_invoker = true);
alter view public."FIN_CustomerPaymentRiskSummary" set (security_invoker = true);
alter view public."FIN_CreditStopRecommendationSummary" set (security_invoker = true);
alter view public."FIN_DisruptionCostRiskSummary" set (security_invoker = true);

revoke all on table
  public."FIN_AccountingDateWorklist",
  public."FIN_CutoffRunSummary",
  public."FIN_WIPAccrualSummary",
  public."FIN_DocumentBalanceSummary",
  public."FIN_JobFinanceSummary",
  public."FIN_JobChargeFinanceSummary",
  public."FIN_ROEWorklist",
  public."FIN_JobROESummary",
  public."FIN_FXGainLossSummary",
  public."FIN_CashAllocationSummary",
  public."FIN_DebtChasingQueue",
  public."FIN_CommissionAccrualSummary",
  public."FIN_ProfitShareSummary",
  public."FIN_ExportReadinessQueue",
  public."FIN_AIInsightQueue",
  public."FIN_CustomerPaymentRiskSummary",
  public."FIN_CreditStopRecommendationSummary",
  public."FIN_DisruptionCostRiskSummary"
from public, anon, authenticated;

grant select on table
  public."FIN_AccountingDateWorklist",
  public."FIN_CutoffRunSummary",
  public."FIN_WIPAccrualSummary",
  public."FIN_DocumentBalanceSummary",
  public."FIN_JobFinanceSummary",
  public."FIN_JobChargeFinanceSummary",
  public."FIN_ROEWorklist",
  public."FIN_JobROESummary",
  public."FIN_FXGainLossSummary",
  public."FIN_CashAllocationSummary",
  public."FIN_DebtChasingQueue",
  public."FIN_CommissionAccrualSummary",
  public."FIN_ProfitShareSummary",
  public."FIN_ExportReadinessQueue",
  public."FIN_AIInsightQueue",
  public."FIN_CustomerPaymentRiskSummary",
  public."FIN_CreditStopRecommendationSummary",
  public."FIN_DisruptionCostRiskSummary"
to service_role;

alter function public."FIN_CalculatePulledRate"(numeric, text, numeric, numeric, integer)
  set search_path = pg_catalog, public;
alter function public."FIN_GetNextOpenPeriod"(uuid, uuid, text, date)
  set search_path = pg_catalog, public;
alter function public."FIN_RecordAIInsight"(varchar, varchar, text, varchar, uuid, uuid, uuid, numeric, uuid)
  set search_path = pg_catalog, public;

revoke all on function public."FIN_CalculatePulledRate"(numeric, text, numeric, numeric, integer) from public, anon, authenticated;
revoke all on function public."FIN_GetNextOpenPeriod"(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public."FIN_RecordAIInsight"(varchar, varchar, text, varchar, uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;

grant execute on function public."FIN_CalculatePulledRate"(numeric, text, numeric, numeric, integer) to service_role;
grant execute on function public."FIN_GetNextOpenPeriod"(uuid, uuid, text, date) to service_role;
grant execute on function public."FIN_RecordAIInsight"(varchar, varchar, text, varchar, uuid, uuid, uuid, numeric, uuid) to service_role;

comment on view public."FIN_DocumentBalanceSummary" is
  'Service-bound finance balance summary. Invoker rights prevent owner-privilege RLS bypass.';
comment on view public."FIN_JobFinanceSummary" is
  'Service-bound job finance summary. Invoker rights prevent owner-privilege RLS bypass.';

commit;
