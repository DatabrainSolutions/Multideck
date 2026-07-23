using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiAiinsight
{
    public Guid EdiaiId { get; set; }

    public Guid? EdiaiMessageId { get; set; }

    public Guid? EdiaiValidationIssueId { get; set; }

    public string EdiaiInsightTypeCode { get; set; } = null!;

    public string EdiaiTitle { get; set; } = null!;

    public string? EdiaiDetail { get; set; }

    public decimal? EdiaiConfidenceScore { get; set; }

    public string? EdiaiSuggestedActionCode { get; set; }

    public string EdiaiStatusCode { get; set; } = null!;

    public Guid? EdiaiAitaskRunId { get; set; }

    public DateTime EdiaiCreatedAt { get; set; }

    public DateTime? EdiaiReviewedAt { get; set; }

    public Guid? EdiaiReviewedBy { get; set; }

    public virtual AiTaskRun? EdiaiAitaskRun { get; set; }

    public virtual EdiMessage? EdiaiMessage { get; set; }

    public virtual CmpUser? EdiaiReviewedByNavigation { get; set; }

    public virtual EdiValidationIssue? EdiaiValidationIssue { get; set; }
}
