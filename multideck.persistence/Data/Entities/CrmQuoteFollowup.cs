using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteFollowup
{
    public Guid CrmqfId { get; set; }

    public Guid CrmqfCusQuoteHeaderId { get; set; }

    public Guid? CrmqfCusQuoteRevId { get; set; }

    public Guid? CrmqfOpportunityId { get; set; }

    public Guid CrmqfCustomerOrgId { get; set; }

    public Guid? CrmqfCustomerContactId { get; set; }

    public Guid? CrmqfOwnerUserId { get; set; }

    public string CrmqfStatusCode { get; set; } = null!;

    public DateTime? CrmqfLastAttemptAt { get; set; }

    public DateTime? CrmqfLastResponseAt { get; set; }

    public DateTime? CrmqfNextActionDueAt { get; set; }

    public DateTime? CrmqfQuoteExpiresAt { get; set; }

    public int CrmqfAttemptCount { get; set; }

    public decimal? CrmqfAiwinProbability { get; set; }

    public decimal? CrmqfAiriskScore { get; set; }

    public string? CrmqfAirecommendedActionCode { get; set; }

    public string? CrmqfCustomerNeedSummary { get; set; }

    public string? CrmqfInternalNotes { get; set; }

    public string CrmqfMetadataJson { get; set; } = null!;

    public DateTime CrmqfCreatedAt { get; set; }

    public Guid? CrmqfCreatedBy { get; set; }

    public DateTime CrmqfUpdatedAt { get; set; }

    public Guid? CrmqfUpdatedBy { get; set; }

    public bool CrmqfIsDeleted { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNote> CrmNotes { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuoteFollowupAiinsight> CrmQuoteFollowupAiinsights { get; set; } = new List<CrmQuoteFollowupAiinsight>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();

    public virtual ICollection<CrmQuoteFollowupResponse> CrmQuoteFollowupResponses { get; set; } = new List<CrmQuoteFollowupResponse>();

    public virtual ICollection<CrmQuoteFollowupSchedule> CrmQuoteFollowupSchedules { get; set; } = new List<CrmQuoteFollowupSchedule>();

    public virtual ICollection<CrmQuoteLostDetail> CrmQuoteLostDetails { get; set; } = new List<CrmQuoteLostDetail>();

    public virtual ICollection<CrmQuoteWinProbability> CrmQuoteWinProbabilities { get; set; } = new List<CrmQuoteWinProbability>();

    public virtual ICollection<CrmTask> CrmTasks { get; set; } = new List<CrmTask>();

    public virtual SysCrmnextBestActionType? CrmqfAirecommendedActionCodeNavigation { get; set; }

    public virtual CmpUser? CrmqfCreatedByNavigation { get; set; }

    public virtual CusQuoteHeader CrmqfCusQuoteHeader { get; set; } = null!;

    public virtual CusQuoteRevision? CrmqfCusQuoteRev { get; set; }

    public virtual OrgContact? CrmqfCustomerContact { get; set; }

    public virtual OrgMaster CrmqfCustomerOrg { get; set; } = null!;

    public virtual CrmOpportunity? CrmqfOpportunity { get; set; }

    public virtual CmpUser? CrmqfOwnerUser { get; set; }

    public virtual SysCrmquoteFollowupStatus CrmqfStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmqfUpdatedByNavigation { get; set; }
}
