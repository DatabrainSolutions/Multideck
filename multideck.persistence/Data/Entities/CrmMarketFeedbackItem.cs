using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMarketFeedbackItem
{
    public Guid CrmfeedbackId { get; set; }

    public string CrmfeedbackSourceCode { get; set; } = null!;

    public string CrmfeedbackCategoryCode { get; set; } = null!;

    public string CrmfeedbackSentimentCode { get; set; } = null!;

    public Guid? CrmfeedbackOrgId { get; set; }

    public Guid? CrmfeedbackLeadId { get; set; }

    public Guid? CrmfeedbackOpportunityId { get; set; }

    public Guid? CrmfeedbackQuoteFollowupId { get; set; }

    public Guid? CrmfeedbackCommThreadId { get; set; }

    public Guid? CrmfeedbackCommMessageId { get; set; }

    public Guid? CrmfeedbackCommCallId { get; set; }

    public string? CrmfeedbackModeCode { get; set; }

    public string? CrmfeedbackTradeLane { get; set; }

    public Guid? CrmfeedbackCompetitorOrgId { get; set; }

    public string? CrmfeedbackCompetitorNameSnapshot { get; set; }

    public string CrmfeedbackFeedbackText { get; set; } = null!;

    public decimal? CrmfeedbackImpactScore { get; set; }

    public decimal? CrmfeedbackConfidenceScore { get; set; }

    public bool CrmfeedbackIsActionable { get; set; }

    public Guid? CrmfeedbackAitaskRunId { get; set; }

    public DateTime CrmfeedbackCreatedAt { get; set; }

    public Guid? CrmfeedbackCreatedBy { get; set; }

    public virtual ICollection<CrmMarketFeedbackEvidence> CrmMarketFeedbackEvidences { get; set; } = new List<CrmMarketFeedbackEvidence>();

    public virtual AiTaskRun? CrmfeedbackAitaskRun { get; set; }

    public virtual SysCrmfeedbackCategory CrmfeedbackCategoryCodeNavigation { get; set; } = null!;

    public virtual CommCallLog? CrmfeedbackCommCall { get; set; }

    public virtual CommMessage? CrmfeedbackCommMessage { get; set; }

    public virtual CommThread? CrmfeedbackCommThread { get; set; }

    public virtual OrgMaster? CrmfeedbackCompetitorOrg { get; set; }

    public virtual CmpUser? CrmfeedbackCreatedByNavigation { get; set; }

    public virtual CrmLead? CrmfeedbackLead { get; set; }

    public virtual CrmOpportunity? CrmfeedbackOpportunity { get; set; }

    public virtual OrgMaster? CrmfeedbackOrg { get; set; }

    public virtual CrmQuoteFollowup? CrmfeedbackQuoteFollowup { get; set; }

    public virtual SysCrmfeedbackSentiment CrmfeedbackSentimentCodeNavigation { get; set; } = null!;

    public virtual SysCrmfeedbackSource CrmfeedbackSourceCodeNavigation { get; set; } = null!;
}
