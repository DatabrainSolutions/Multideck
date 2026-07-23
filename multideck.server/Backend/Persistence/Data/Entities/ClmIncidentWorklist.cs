using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmIncidentWorklist
{
    public Guid? ClmincidentId { get; set; }

    public string? ClmincidentNumber { get; set; }

    public string? ClmincidentTitle { get; set; }

    public Guid? ClmincidentJobId { get; set; }

    public int? JobNumber { get; set; }

    public Guid? ClmincidentCustomerOrgId { get; set; }

    public string? ClmincidentCustomerName { get; set; }

    public Guid? ClmincidentOrgOfficeId { get; set; }

    public string? ClmincidentTypeCode { get; set; }

    public string? ClmincidentTypeName { get; set; }

    public string? ClmincidentStatusCode { get; set; }

    public string? ClmincidentStatusName { get; set; }

    public string? ClmincidentSeverityCode { get; set; }

    public string? ClmseverityName { get; set; }

    public int? ClmseverityWeight { get; set; }

    public DateTime? ClmincidentReportedAt { get; set; }

    public DateTime? ClmincidentOccurredAt { get; set; }

    public Guid? ClmincidentOwnerUserId { get; set; }

    public decimal? ClmincidentPotentialClaimAmount { get; set; }

    public decimal? ClmincidentEstimatedLossAmount { get; set; }

    public string? ClmincidentCurrencyCodeSnapshot { get; set; }

    public bool? ClmincidentHasClaim { get; set; }

    public int? ClmincidentEvidenceCount { get; set; }

    public int? ClmincidentClaimCount { get; set; }
}
