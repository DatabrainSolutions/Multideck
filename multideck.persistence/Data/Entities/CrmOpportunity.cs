using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunity
{
    public Guid CrmopptyId { get; set; }

    public Guid? CrmopptyAccountId { get; set; }

    public Guid CrmopptyOrgId { get; set; }

    public Guid? CrmopptyPrimaryContactId { get; set; }

    public Guid? CrmopptySourceLeadId { get; set; }

    public Guid? CrmopptyOwnerUserId { get; set; }

    public Guid? CrmopptyOrgOfficeId { get; set; }

    public Guid? CrmopptyLegalEntityId { get; set; }

    public Guid? CrmopptyBrandId { get; set; }

    public string CrmopptyName { get; set; } = null!;

    public string CrmopptyTypeCode { get; set; } = null!;

    public string CrmopptyStageCode { get; set; } = null!;

    public string CrmopptyStatusCode { get; set; } = null!;

    public string CrmopptyForecastCategoryCode { get; set; } = null!;

    public string? CrmopptyModeCode { get; set; }

    public string? CrmopptyShipmentTypeCode { get; set; }

    public string? CrmopptyDirectionCode { get; set; }

    public string? CrmopptyOriginUnlocode { get; set; }

    public string? CrmopptyOriginNameSnapshot { get; set; }

    public string? CrmopptyDestinationUnlocode { get; set; }

    public string? CrmopptyDestinationNameSnapshot { get; set; }

    public string? CrmopptyTradeLane { get; set; }

    public string? CrmopptyServiceInterest { get; set; }

    public DateOnly? CrmopptyExpectedCloseDate { get; set; }

    public decimal? CrmopptyProbabilityPct { get; set; }

    public decimal? CrmopptyExpectedValueAmount { get; set; }

    public decimal? CrmopptyExpectedMarginAmount { get; set; }

    public string? CrmopptyCurrencyCode { get; set; }

    public decimal? CrmopptyWeightedValueAmount { get; set; }

    public DateTime? CrmopptyNextActionDueAt { get; set; }

    public DateTime? CrmopptyLastActivityAt { get; set; }

    public DateTime? CrmopptyWonAt { get; set; }

    public DateTime? CrmopptyLostAt { get; set; }

    public string? CrmopptyLossReasonCode { get; set; }

    public string? CrmopptyLossDetails { get; set; }

    public string? CrmopptyCustomerNeed { get; set; }

    public string? CrmopptyValueProposition { get; set; }

    public decimal? CrmopptyAiwinProbability { get; set; }

    public decimal? CrmopptyAiriskScore { get; set; }

    public string CrmopptyMetadataJson { get; set; } = null!;

    public DateTime CrmopptyCreatedAt { get; set; }

    public Guid? CrmopptyCreatedBy { get; set; }

    public DateTime CrmopptyUpdatedAt { get; set; }

    public Guid? CrmopptyUpdatedBy { get; set; }

    public bool CrmopptyIsDeleted { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmCampaignMember> CrmCampaignMembers { get; set; } = new List<CrmCampaignMember>();

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNote> CrmNotes { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRuns { get; set; } = new List<CrmOnboardingRun>();

    public virtual ICollection<CrmOpportunityCompetitor> CrmOpportunityCompetitors { get; set; } = new List<CrmOpportunityCompetitor>();

    public virtual ICollection<CrmOpportunityJobLink> CrmOpportunityJobLinks { get; set; } = new List<CrmOpportunityJobLink>();

    public virtual ICollection<CrmOpportunityLine> CrmOpportunityLines { get; set; } = new List<CrmOpportunityLine>();

    public virtual ICollection<CrmOpportunityQuoteLink> CrmOpportunityQuoteLinks { get; set; } = new List<CrmOpportunityQuoteLink>();

    public virtual ICollection<CrmOpportunityStageHistory> CrmOpportunityStageHistories { get; set; } = new List<CrmOpportunityStageHistory>();

    public virtual ICollection<CrmOpportunityStakeholder> CrmOpportunityStakeholders { get; set; } = new List<CrmOpportunityStakeholder>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuoteFollowup> CrmQuoteFollowups { get; set; } = new List<CrmQuoteFollowup>();

    public virtual ICollection<CrmReminder> CrmReminders { get; set; } = new List<CrmReminder>();

    public virtual ICollection<CrmSentimentSignal> CrmSentimentSignals { get; set; } = new List<CrmSentimentSignal>();

    public virtual ICollection<CrmTask> CrmTasks { get; set; } = new List<CrmTask>();

    public virtual CrmAccountProfile? CrmopptyAccount { get; set; }

    public virtual CmpBrand? CrmopptyBrand { get; set; }

    public virtual CmpUser? CrmopptyCreatedByNavigation { get; set; }

    public virtual SysCrmforecastCategory CrmopptyForecastCategoryCodeNavigation { get; set; } = null!;

    public virtual CmpLegalEntity? CrmopptyLegalEntity { get; set; }

    public virtual SysCrmlossReason? CrmopptyLossReasonCodeNavigation { get; set; }

    public virtual OrgMaster CrmopptyOrg { get; set; } = null!;

    public virtual CmpOffice? CrmopptyOrgOffice { get; set; }

    public virtual CmpUser? CrmopptyOwnerUser { get; set; }

    public virtual OrgContact? CrmopptyPrimaryContact { get; set; }

    public virtual CrmLead? CrmopptySourceLead { get; set; }

    public virtual SysCrmopportunityStage CrmopptyStageCodeNavigation { get; set; } = null!;

    public virtual SysCrmopportunityStatus CrmopptyStatusCodeNavigation { get; set; } = null!;

    public virtual SysCrmopportunityType CrmopptyTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmopptyUpdatedByNavigation { get; set; }
}
