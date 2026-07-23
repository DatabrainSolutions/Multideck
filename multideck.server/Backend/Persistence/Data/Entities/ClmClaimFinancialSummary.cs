using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimFinancialSummary
{
    public Guid? ClmclaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public string? ClmclaimStatusCode { get; set; }

    public string? ClmclaimCurrencyCodeSnapshot { get; set; }

    public decimal? ClmclaimClaimedAmount { get; set; }

    public decimal? ClmclaimLineClaimedAmount { get; set; }

    public decimal? ClmclaimReserveAmount { get; set; }

    public decimal? ClmclaimExpenseReserveAmount { get; set; }

    public decimal? ClmclaimDeductibleAmount { get; set; }

    public decimal? ClmclaimSettlementAmount { get; set; }

    public decimal? ClmclaimRecoveryExpectedAmount { get; set; }

    public decimal? ClmclaimRecoveryReceivedAmount { get; set; }

    public decimal? ClmclaimLinkedSettlementAmount { get; set; }

    public decimal? ClmclaimLinkedRecoveryAmount { get; set; }

    public decimal? ClmclaimNetExposureAmount { get; set; }
}
