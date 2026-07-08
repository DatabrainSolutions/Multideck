using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAiinsight
{
    public Guid CrmaiinsightId { get; set; }

    public Guid? CrmaiinsightRuleId { get; set; }

    public Guid? CrmaiinsightAitaskRunId { get; set; }

    public string CrmaiinsightInsightTypeCode { get; set; } = null!;

    public string CrmaiinsightStatusCode { get; set; } = null!;

    public string CrmaiinsightTitle { get; set; } = null!;

    public string? CrmaiinsightSummary { get; set; }

    public Guid? CrmaiinsightAccountId { get; set; }

    public Guid? CrmaiinsightLeadId { get; set; }

    public Guid? CrmaiinsightOpportunityId { get; set; }

    public Guid? CrmaiinsightQuoteFollowupId { get; set; }

    public Guid? CrmaiinsightCampaignId { get; set; }

    public Guid? CrmaiinsightTargetUserId { get; set; }

    public string CrmaiinsightSeverityCode { get; set; } = null!;

    public decimal? CrmaiinsightConfidenceScore { get; set; }

    public decimal? CrmaiinsightImpactScore { get; set; }

    public string? CrmaiinsightRecommendedActionCode { get; set; }

    public string CrmaiinsightEvidenceJson { get; set; } = null!;

    public DateTime CrmaiinsightCreatedAt { get; set; }

    public DateTime? CrmaiinsightReviewedAt { get; set; }

    public Guid? CrmaiinsightReviewedBy { get; set; }

    public virtual ICollection<CrmAiinsightTarget> CrmAiinsightTargets { get; set; } = new List<CrmAiinsightTarget>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual CrmAccountProfile? CrmaiinsightAccount { get; set; }

    public virtual AiTaskRun? CrmaiinsightAitaskRun { get; set; }

    public virtual CrmCampaign? CrmaiinsightCampaign { get; set; }

    public virtual SysCrminsightType CrmaiinsightInsightTypeCodeNavigation { get; set; } = null!;

    public virtual CrmLead? CrmaiinsightLead { get; set; }

    public virtual CrmOpportunity? CrmaiinsightOpportunity { get; set; }

    public virtual CrmQuoteFollowup? CrmaiinsightQuoteFollowup { get; set; }

    public virtual SysCrmnextBestActionType? CrmaiinsightRecommendedActionCodeNavigation { get; set; }

    public virtual CmpUser? CrmaiinsightReviewedByNavigation { get; set; }

    public virtual CrmAiinsightRule? CrmaiinsightRule { get; set; }

    public virtual SysCrminsightStatus CrmaiinsightStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmaiinsightTargetUser { get; set; }
}
