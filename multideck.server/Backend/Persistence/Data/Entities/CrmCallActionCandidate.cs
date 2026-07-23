using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallActionCandidate
{
    public Guid CrmcallActionId { get; set; }

    public Guid CrmcallActionCallReviewId { get; set; }

    public Guid? CrmcallActionCommCallActionId { get; set; }

    public string CrmcallActionActionTypeCode { get; set; } = null!;

    public string CrmcallActionTitle { get; set; } = null!;

    public string? CrmcallActionDescription { get; set; }

    public DateTime? CrmcallActionSuggestedDueAt { get; set; }

    public Guid? CrmcallActionSuggestedOwnerUserId { get; set; }

    public decimal? CrmcallActionConfidenceScore { get; set; }

    public string CrmcallActionDecisionStatus { get; set; } = null!;

    public string? CrmcallActionDecisionReason { get; set; }

    public Guid? CrmcallActionWorkflowTaskId { get; set; }

    public Guid? CrmcallActionCreatedNoteId { get; set; }

    public DateTime? CrmcallActionDecidedAt { get; set; }

    public Guid? CrmcallActionDecidedBy { get; set; }

    public string CrmcallActionMetadataJson { get; set; } = null!;

    public DateTime CrmcallActionCreatedAt { get; set; }

    public virtual ICollection<CrmCallReviewDecision> CrmCallReviewDecisions { get; set; } = new List<CrmCallReviewDecision>();

    public virtual SysCrmcallActionType CrmcallActionActionTypeCodeNavigation { get; set; } = null!;

    public virtual CrmCallReview CrmcallActionCallReview { get; set; } = null!;

    public virtual CommCallActionItem? CrmcallActionCommCallAction { get; set; }

    public virtual CrmNote? CrmcallActionCreatedNote { get; set; }

    public virtual CmpUser? CrmcallActionDecidedByNavigation { get; set; }

    public virtual CmpUser? CrmcallActionSuggestedOwnerUser { get; set; }

    public virtual WorkflowTask? CrmcallActionWorkflowTask { get; set; }
}
