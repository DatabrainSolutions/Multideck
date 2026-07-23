using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCashAllocationSummary
{
    public Guid? FincashId { get; set; }

    public string? FincashTypeCode { get; set; }

    public string? FincashStatusCode { get; set; }

    public Guid? FincashPartyOrgId { get; set; }

    public DateOnly? FincashTransactionDate { get; set; }

    public string? FincashCurrencyCodeSnapshot { get; set; }

    public decimal? FincashAmount { get; set; }

    public decimal? FincashUnallocatedAmount { get; set; }

    public int? FincashAllocationCount { get; set; }

    public decimal? FincashAllocatedAmount { get; set; }

    public decimal? FincashFxgainLossAmount { get; set; }
}
