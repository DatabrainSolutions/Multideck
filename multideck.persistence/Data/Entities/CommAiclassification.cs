using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommAiclassification
{
    public Guid CommAiId { get; set; }

    public Guid? CommAiThreadId { get; set; }

    public Guid? CommAiMessageId { get; set; }

    public Guid? CommAiTaskRunId { get; set; }

    public string CommAiClassificationType { get; set; } = null!;

    public string? CommAiIntentCode { get; set; }

    public string? CommAiSentiment { get; set; }

    public string? CommAiUrgencyCode { get; set; }

    public string? CommAiSummary { get; set; }

    public string? CommAiSuggestedAction { get; set; }

    public Guid? CommAiSuggestedUserId { get; set; }

    public Guid? CommAiSuggestedGroupId { get; set; }

    public decimal? CommAiConfidence { get; set; }

    public string CommAiResultJson { get; set; } = null!;

    public bool? CommAiIsAccepted { get; set; }

    public DateTime? CommAiReviewedAt { get; set; }

    public Guid? CommAiReviewedBy { get; set; }

    public DateTime CommAiCreatedAt { get; set; }

    public virtual CommMessage? CommAiMessage { get; set; }

    public virtual CmpUser? CommAiReviewedByNavigation { get; set; }

    public virtual CmpGroup? CommAiSuggestedGroup { get; set; }

    public virtual CmpUser? CommAiSuggestedUser { get; set; }

    public virtual AiTaskRun? CommAiTaskRun { get; set; }

    public virtual CommThread? CommAiThread { get; set; }

    public virtual SysCommPriority? CommAiUrgencyCodeNavigation { get; set; }

    public virtual ICollection<CommExtractedEntity> CommExtractedEntities { get; set; } = new List<CommExtractedEntity>();
}
