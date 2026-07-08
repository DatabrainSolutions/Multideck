using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAccountSalesSummary
{
    public Guid? CrmaccountId { get; set; }

    public Guid? CrmaccountOrgId { get; set; }

    public string? CrmaccountOrgName { get; set; }

    public string? CrmaccountRelationshipStatusCode { get; set; }

    public Guid? CrmaccountOwnerUserId { get; set; }

    public string? CrmaccountOwnerEmail { get; set; }

    public Guid? CrmaccountOrgOfficeId { get; set; }

    public string? CrmaccountTier { get; set; }

    public string? CrmaccountSegment { get; set; }

    public string? CrmaccountVertical { get; set; }

    public decimal? CrmaccountHealthScore { get; set; }

    public decimal? CrmaccountChurnRiskScore { get; set; }

    public long? CrmaccountOpenLeadCount { get; set; }

    public long? CrmaccountOpenOpportunityCount { get; set; }

    public long? CrmaccountOpenQuoteFollowupCount { get; set; }

    public DateTime? CrmaccountLastActivityAt { get; set; }

    public DateTime? CrmaccountNextQuoteActionDueAt { get; set; }
}
