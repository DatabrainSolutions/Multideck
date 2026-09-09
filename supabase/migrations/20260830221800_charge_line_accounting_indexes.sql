begin;

create index if not exists "IX_Job_Costing_Lines_cost_nominal"
  on public."Job_Costing_Lines"("JobCostingLine_CostNominalAccountID");

create index if not exists "IX_Job_Costing_Lines_revenue_nominal"
  on public."Job_Costing_Lines"("JobCostingLine_RevenueNominalAccountID");

create index if not exists "IX_FIN_JobChargePeriodAllocations_cost_nominal"
  on public."FIN_JobChargePeriodAllocations"("FINChargePeriod_CostNominalAccountID");

create index if not exists "IX_FIN_JobChargePeriodAllocations_revenue_nominal"
  on public."FIN_JobChargePeriodAllocations"("FINChargePeriod_RevenueNominalAccountID");

create index if not exists "IX_FIN_JobChargePeriodAllocations_costing_line"
  on public."FIN_JobChargePeriodAllocations"("FINChargePeriod_JobCostingLineID");

create index if not exists "IX_FIN_JobChargePeriodAllocations_updated_by"
  on public."FIN_JobChargePeriodAllocations"("FINChargePeriod_UpdatedBy");

commit;
