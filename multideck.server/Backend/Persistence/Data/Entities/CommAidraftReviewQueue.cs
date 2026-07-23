using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommAidraftReviewQueue
{
    public Guid? CommAidraftId { get; set; }

    public Guid? CommAidraftThreadId { get; set; }

    public string? CommThreadSubject { get; set; }

    public Guid? CommAidraftSourceMessageId { get; set; }

    public string? CommAidraftStatusCode { get; set; }

    public string? CommAidraftChannelCode { get; set; }

    public string? CommAidraftSubject { get; set; }

    public string? CommAidraftBodyText { get; set; }

    public decimal? CommAidraftConfidence { get; set; }

    public bool? CommAidraftReviewRequired { get; set; }

    public bool? CommAidraftAutoSendEligible { get; set; }

    public string? CommAipolicyCode { get; set; }

    public string? CommAipolicyName { get; set; }

    public bool? CommAipolicyAutoSendEnabled { get; set; }

    public decimal? CommAipolicyMinConfidence { get; set; }

    public DateTime? CommAidraftCreatedAt { get; set; }

    public DateTime? CommAidraftExpiresAt { get; set; }
}
