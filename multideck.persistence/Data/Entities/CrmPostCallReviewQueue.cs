using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmPostCallReviewQueue
{
    public Guid? CrmcallReviewId { get; set; }

    public Guid? CrmcallReviewCommCallId { get; set; }

    public string? CommCallProviderCallId { get; set; }

    public string? CommCallDirectionCode { get; set; }

    public string? CommCallStatusCode { get; set; }

    public string? CommCallFromNumber { get; set; }

    public string? CommCallToNumber { get; set; }

    public DateTime? CommCallStartedAt { get; set; }

    public int? CommCallDurationSeconds { get; set; }

    public string? CrmcallReviewStatusCode { get; set; }

    public Guid? CrmcallReviewAccountId { get; set; }

    public string? CrmcallReviewAccountName { get; set; }

    public Guid? CrmcallReviewLeadId { get; set; }

    public Guid? CrmcallReviewOpportunityId { get; set; }

    public Guid? CrmcallReviewQuoteFollowupId { get; set; }

    public Guid? CrmcallReviewOwnerUserId { get; set; }

    public string? CrmcallReviewOwnerEmail { get; set; }

    public string? CrmcallReviewAisentimentCode { get; set; }

    public decimal? CrmcallReviewAiurgencyScore { get; set; }

    public long? CrmcallReviewPendingActionCount { get; set; }

    public long? CrmcallReviewAcceptedActionCount { get; set; }

    public DateTime? CrmcallReviewCreatedAt { get; set; }
}
