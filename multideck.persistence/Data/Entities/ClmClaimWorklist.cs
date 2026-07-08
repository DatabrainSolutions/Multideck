using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimWorklist
{
    public Guid? ClmclaimId { get; set; }

    public string? ClmclaimNumber { get; set; }

    public string? ClmclaimTitle { get; set; }

    public Guid? ClmclaimIncidentId { get; set; }

    public string? ClmincidentNumber { get; set; }

    public Guid? ClmclaimJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? ClmclaimCustomerOrgId { get; set; }

    public string? ClmclaimCustomerName { get; set; }

    public Guid? ClmclaimOrgOfficeId { get; set; }

    public string? ClmclaimTypeCode { get; set; }

    public string? ClmclaimTypeName { get; set; }

    public string? ClmclaimStatusCode { get; set; }

    public string? ClmclaimStatusName { get; set; }

    public bool? ClmclaimStatusIsOpen { get; set; }

    public string? ClmclaimLiabilityStatusCode { get; set; }

    public string? ClmliabilityStatusName { get; set; }

    public string? ClmclaimCurrencyCodeSnapshot { get; set; }

    public decimal? ClmclaimClaimedAmount { get; set; }

    public decimal? ClmclaimReserveAmount { get; set; }

    public decimal? ClmclaimExpenseReserveAmount { get; set; }

    public decimal? ClmclaimRecoveryExpectedAmount { get; set; }

    public decimal? ClmclaimRecoveryReceivedAmount { get; set; }

    public decimal? ClmclaimSettlementAmount { get; set; }

    public DateOnly? ClmclaimLimitationDate { get; set; }

    public Guid? ClmclaimOwnerUserId { get; set; }

    public DateTime? ClmclaimCreatedAt { get; set; }

    public int? ClmclaimEvidenceCount { get; set; }

    public int? ClmclaimOpenTaskCount { get; set; }
}
