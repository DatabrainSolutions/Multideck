using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowupQueue
{
    public Guid? CrmqfId { get; set; }

    public Guid? CrmqfCusQuoteHeaderId { get; set; }

    public int? CusQuoteHeaderNumber { get; set; }

    public Guid? CrmqfCusQuoteRevId { get; set; }

    public int? CusQuoteRevNumber { get; set; }

    public Guid? CrmqfOpportunityId { get; set; }

    public string? CrmopptyName { get; set; }

    public Guid? CrmqfCustomerOrgId { get; set; }

    public string? CrmqfCustomerName { get; set; }

    public Guid? CrmqfOwnerUserId { get; set; }

    public string? CrmqfOwnerEmail { get; set; }

    public string? CrmqfStatusCode { get; set; }

    public string? CrmqfstatusName { get; set; }

    public int? CrmqfAttemptCount { get; set; }

    public DateTime? CrmqfLastAttemptAt { get; set; }

    public DateTime? CrmqfLastResponseAt { get; set; }

    public DateTime? CrmqfNextActionDueAt { get; set; }

    public DateTime? CrmqfQuoteExpiresAt { get; set; }

    public decimal? CrmqfAiwinProbability { get; set; }

    public decimal? CrmqfAiriskScore { get; set; }

    public string? CrmqfAirecommendedActionCode { get; set; }

    public DateTime? CrmqfCreatedAt { get; set; }
}
