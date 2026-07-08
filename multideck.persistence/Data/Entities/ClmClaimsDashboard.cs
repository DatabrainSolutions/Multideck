using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimsDashboard
{
    public Guid? ClmclaimOrgOfficeId { get; set; }

    public Guid? ClmclaimLegalEntityId { get; set; }

    public Guid? ClmclaimBrandId { get; set; }

    public string? ClmclaimStatusCode { get; set; }

    public string? ClmclaimStatusName { get; set; }

    public bool? ClmclaimStatusIsOpen { get; set; }

    public string? ClmclaimTypeCode { get; set; }

    public string? ClmclaimTypeName { get; set; }

    public string? ClmclaimCurrencyCodeSnapshot { get; set; }

    public int? ClmclaimsCount { get; set; }

    public decimal? ClmclaimsClaimedAmount { get; set; }

    public decimal? ClmclaimsReserveAmount { get; set; }

    public decimal? ClmclaimsSettlementAmount { get; set; }

    public decimal? ClmclaimsRecoveryExpectedAmount { get; set; }

    public decimal? ClmclaimsRecoveryReceivedAmount { get; set; }

    public decimal? ClmclaimsAverageClosedDays { get; set; }
}
