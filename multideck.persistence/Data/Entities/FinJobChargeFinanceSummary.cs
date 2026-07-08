using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobChargeFinanceSummary
{
    public Guid? FinchargeStateId { get; set; }

    public Guid? FinchargeStateJobId { get; set; }

    public Guid? FinchargeStateChargeInId { get; set; }

    public Guid? FinchargeStateChargeOutId { get; set; }

    public string? FinchargeStateLedgerTypeCode { get; set; }

    public string? FinchargeStateStatusCode { get; set; }

    public decimal? FinchargeStateExpectedAmount { get; set; }

    public decimal? FinchargeStateInvoicedAmount { get; set; }

    public decimal? FinchargeStateCreditedAmount { get; set; }

    public decimal? FinchargeStatePaidAmount { get; set; }

    public decimal? FinchargeStateOutstandingAmount { get; set; }

    public string? FinchargeStateCurrencyCodeSnapshot { get; set; }

    public int? FinchargeStateAllocationCount { get; set; }
}
