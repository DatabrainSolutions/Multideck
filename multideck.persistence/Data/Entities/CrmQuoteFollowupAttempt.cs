using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowupAttempt
{
    public Guid CrmqfattemptId { get; set; }

    public Guid CrmqfattemptFollowupId { get; set; }

    public string CrmqfattemptActivityTypeCode { get; set; } = null!;

    public string? CrmqfattemptOutcomeCode { get; set; }

    public Guid? CrmqfattemptCommThreadId { get; set; }

    public Guid? CrmqfattemptCommMessageId { get; set; }

    public Guid? CrmqfattemptCommCallId { get; set; }

    public DateTime CrmqfattemptAttemptedAt { get; set; }

    public Guid? CrmqfattemptAttemptedBy { get; set; }

    public string? CrmqfattemptSummary { get; set; }

    public DateTime? CrmqfattemptNextActionDueAt { get; set; }

    public string? CrmqfattemptCustomerFeedback { get; set; }

    public string CrmqfattemptMetadataJson { get; set; } = null!;

    public virtual ICollection<CrmQuoteFollowupResponse> CrmQuoteFollowupResponses { get; set; } = new List<CrmQuoteFollowupResponse>();

    public virtual SysCrmactivityType CrmqfattemptActivityTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmqfattemptAttemptedByNavigation { get; set; }

    public virtual CommCallLog? CrmqfattemptCommCall { get; set; }

    public virtual CommMessage? CrmqfattemptCommMessage { get; set; }

    public virtual CommThread? CrmqfattemptCommThread { get; set; }

    public virtual CrmQuoteFollowup CrmqfattemptFollowup { get; set; } = null!;

    public virtual SysCrmactivityOutcome? CrmqfattemptOutcomeCodeNavigation { get; set; }
}
