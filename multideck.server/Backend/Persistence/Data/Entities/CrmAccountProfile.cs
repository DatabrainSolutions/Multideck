using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmAccountProfile
{
    public Guid CrmaccountId { get; set; }

    public Guid CrmaccountOrgId { get; set; }

    public string CrmaccountRelationshipStatusCode { get; set; } = null!;

    public Guid? CrmaccountOwnerUserId { get; set; }

    public Guid? CrmaccountTerritoryId { get; set; }

    public Guid? CrmaccountOrgOfficeId { get; set; }

    public Guid? CrmaccountLegalEntityId { get; set; }

    public Guid? CrmaccountBrandId { get; set; }

    public string? CrmaccountTier { get; set; }

    public string? CrmaccountSegment { get; set; }

    public string? CrmaccountVertical { get; set; }

    public string? CrmaccountPrimaryModeCode { get; set; }

    public string? CrmaccountPrimaryTradeLane { get; set; }

    public string CrmaccountTargetLanesJson { get; set; } = null!;

    public string? CrmaccountGrowthState { get; set; }

    public decimal? CrmaccountHealthScore { get; set; }

    public decimal? CrmaccountChurnRiskScore { get; set; }

    public decimal? CrmaccountLifetimeValueAmount { get; set; }

    public string? CrmaccountLifetimeValueCurrencyCode { get; set; }

    public DateTime? CrmaccountLastContactAt { get; set; }

    public DateTime? CrmaccountNextActionDueAt { get; set; }

    public bool CrmaccountIsStrategic { get; set; }

    public bool CrmaccountIsTrainingAllowed { get; set; }

    public string? CrmaccountCustomerCentricSummary { get; set; }

    public string CrmaccountMetadataJson { get; set; } = null!;

    public DateTime CrmaccountCreatedAt { get; set; }

    public Guid? CrmaccountCreatedBy { get; set; }

    public DateTime CrmaccountUpdatedAt { get; set; }

    public Guid? CrmaccountUpdatedBy { get; set; }

    public bool CrmaccountIsDeleted { get; set; }

    public virtual ICollection<CrmAccountAssignment> CrmAccountAssignments { get; set; } = new List<CrmAccountAssignment>();

    public virtual ICollection<CrmAccountSegmentation> CrmAccountSegmentations { get; set; } = new List<CrmAccountSegmentation>();

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmChurnRiskScore> CrmChurnRiskScores { get; set; } = new List<CrmChurnRiskScore>();

    public virtual ICollection<CrmContactProfile> CrmContactProfiles { get; set; } = new List<CrmContactProfile>();

    public virtual ICollection<CrmGrowthSignal> CrmGrowthSignals { get; set; } = new List<CrmGrowthSignal>();

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNote> CrmNotes { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmOnboardingRun> CrmOnboardingRuns { get; set; } = new List<CrmOnboardingRun>();

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmRelationshipMap> CrmRelationshipMaps { get; set; } = new List<CrmRelationshipMap>();

    public virtual ICollection<CrmReminder> CrmReminders { get; set; } = new List<CrmReminder>();

    public virtual ICollection<CrmSalesPitchAnalysis> CrmSalesPitchAnalyses { get; set; } = new List<CrmSalesPitchAnalysis>();

    public virtual ICollection<CrmTask> CrmTasks { get; set; } = new List<CrmTask>();

    public virtual CmpBrand? CrmaccountBrand { get; set; }

    public virtual CmpUser? CrmaccountCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? CrmaccountLegalEntity { get; set; }

    public virtual OrgMaster CrmaccountOrg { get; set; } = null!;

    public virtual CmpOffice? CrmaccountOrgOffice { get; set; }

    public virtual CmpUser? CrmaccountOwnerUser { get; set; }

    public virtual SysCrmrelationshipStatus CrmaccountRelationshipStatusCodeNavigation { get; set; } = null!;

    public virtual CrmTerritory? CrmaccountTerritory { get; set; }

    public virtual CmpUser? CrmaccountUpdatedByNavigation { get; set; }
}
