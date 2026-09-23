-- The 15 September schema snapshot includes pg_dump's broad view GRANTs after
-- the older reporting-boundary migration. Reassert the final access state for
-- both existing tenants and tenants provisioned from that snapshot.
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

commit;
