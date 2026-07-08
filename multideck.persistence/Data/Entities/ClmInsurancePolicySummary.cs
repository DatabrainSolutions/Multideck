using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmInsurancePolicySummary
{
    public Guid? ClmpolicyId { get; set; }

    public string? ClmpolicyNumber { get; set; }

    public string? ClmpolicyName { get; set; }

    public string? ClmpolicyTypeCode { get; set; }

    public string? ClmpolicyTypeName { get; set; }

    public string? ClmpolicyStatusCode { get; set; }

    public string? ClmpolicyStatusName { get; set; }

    public Guid? ClmpolicyOrgOfficeId { get; set; }

    public Guid? ClmpolicyLegalEntityId { get; set; }

    public Guid? ClmpolicyInsurerOrgId { get; set; }

    public string? ClmpolicyInsurerName { get; set; }

    public Guid? ClmpolicyBrokerOrgId { get; set; }

    public string? ClmpolicyBrokerName { get; set; }

    public string? ClmpolicyCurrencyCodeSnapshot { get; set; }

    public decimal? ClmpolicyPerClaimLimitAmount { get; set; }

    public decimal? ClmpolicyAggregateLimitAmount { get; set; }

    public decimal? ClmpolicyDeductibleAmount { get; set; }

    public DateOnly? ClmpolicyInceptionDate { get; set; }

    public DateOnly? ClmpolicyExpiryDate { get; set; }

    public DateOnly? ClmpolicyRenewalNoticeDate { get; set; }

    public int? ClmpolicyCoverageCount { get; set; }

    public int? ClmpolicyOpenClaimCount { get; set; }
}
