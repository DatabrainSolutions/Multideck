using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCallReview
{
    public Guid CrmcallReviewId { get; set; }

    public Guid CrmcallReviewCommCallId { get; set; }

    public string CrmcallReviewStatusCode { get; set; } = null!;

    public Guid? CrmcallReviewAccountId { get; set; }

    public Guid? CrmcallReviewLeadId { get; set; }

    public Guid? CrmcallReviewOpportunityId { get; set; }

    public Guid? CrmcallReviewQuoteFollowupId { get; set; }

    public Guid? CrmcallReviewJobId { get; set; }

    public Guid? CrmcallReviewOwnerUserId { get; set; }

    public string? CrmcallReviewAisummary { get; set; }

    public string? CrmcallReviewUserApprovedSummary { get; set; }

    public string? CrmcallReviewAisentimentCode { get; set; }

    public decimal? CrmcallReviewAiurgencyScore { get; set; }

    public DateTime? CrmcallReviewReviewedAt { get; set; }

    public Guid? CrmcallReviewReviewedBy { get; set; }

    public string CrmcallReviewMetadataJson { get; set; } = null!;

    public DateTime CrmcallReviewCreatedAt { get; set; }

    public Guid? CrmcallReviewCreatedBy { get; set; }

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidates { get; set; } = new List<CrmCallActionCandidate>();

    public virtual ICollection<CrmCallEntityLink> CrmCallEntityLinks { get; set; } = new List<CrmCallEntityLink>();

    public virtual ICollection<CrmCallReviewDecision> CrmCallReviewDecisions { get; set; } = new List<CrmCallReviewDecision>();

    public virtual ICollection<CrmCallSummaryNote> CrmCallSummaryNotes { get; set; } = new List<CrmCallSummaryNote>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmTask> CrmTasks { get; set; } = new List<CrmTask>();

    public virtual CrmAccountProfile? CrmcallReviewAccount { get; set; }

    public virtual SysCrmfeedbackSentiment? CrmcallReviewAisentimentCodeNavigation { get; set; }

    public virtual CommCallLog CrmcallReviewCommCall { get; set; } = null!;

    public virtual CmpUser? CrmcallReviewCreatedByNavigation { get; set; }

    public virtual JobHeader? CrmcallReviewJob { get; set; }

    public virtual CrmLead? CrmcallReviewLead { get; set; }

    public virtual CrmOpportunity? CrmcallReviewOpportunity { get; set; }

    public virtual CmpUser? CrmcallReviewOwnerUser { get; set; }

    public virtual CrmQuoteFollowup? CrmcallReviewQuoteFollowup { get; set; }

    public virtual CmpUser? CrmcallReviewReviewedByNavigation { get; set; }

    public virtual SysCrmcallReviewStatus CrmcallReviewStatusCodeNavigation { get; set; } = null!;
}
