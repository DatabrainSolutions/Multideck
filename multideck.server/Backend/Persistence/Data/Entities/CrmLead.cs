using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmLead
{
    public Guid CrmleadId { get; set; }

    public Guid? CrmleadOrgId { get; set; }

    public Guid? CrmleadPrimaryContactId { get; set; }

    public string CrmleadSourceCode { get; set; } = null!;

    public string CrmleadStatusCode { get; set; } = null!;

    public string CrmleadRatingCode { get; set; } = null!;

    public Guid? CrmleadOwnerUserId { get; set; }

    public Guid? CrmleadOrgOfficeId { get; set; }

    public Guid? CrmleadLegalEntityId { get; set; }

    public Guid? CrmleadBrandId { get; set; }

    public string? CrmleadCompanyName { get; set; }

    public string? CrmleadPersonName { get; set; }

    public string? CrmleadEmail { get; set; }

    public string? CrmleadPhone { get; set; }

    public string? CrmleadCountryCode { get; set; }

    public string? CrmleadModeCode { get; set; }

    public string? CrmleadDirectionCode { get; set; }

    public string? CrmleadTradeLane { get; set; }

    public string? CrmleadServiceInterest { get; set; }

    public string? CrmleadCargoDescription { get; set; }

    public decimal? CrmleadEstimatedValueAmount { get; set; }

    public string? CrmleadEstimatedValueCurrencyCode { get; set; }

    public DateOnly? CrmleadExpectedShipmentDate { get; set; }

    public string? CrmleadUrgencyCode { get; set; }

    public decimal? CrmleadScore { get; set; }

    public decimal? CrmleadAiprobabilityToConvert { get; set; }

    public DateTime? CrmleadLastInteractionAt { get; set; }

    public DateTime? CrmleadNextActionDueAt { get; set; }

    public DateTime? CrmleadFirstResponseDueAt { get; set; }

    public DateTime? CrmleadFirstRespondedAt { get; set; }

    public string? CrmleadDisqualifiedReason { get; set; }

    public string? CrmleadCustomerCentricNeed { get; set; }

    public string CrmleadMetadataJson { get; set; } = null!;

    public DateTime CrmleadCreatedAt { get; set; }

    public Guid? CrmleadCreatedBy { get; set; }

    public DateTime CrmleadUpdatedAt { get; set; }

    public Guid? CrmleadUpdatedBy { get; set; }

    public bool CrmleadIsDeleted { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();

    public virtual ICollection<CrmAiinsight> CrmAiinsights { get; set; } = new List<CrmAiinsight>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallReview> CrmCallReviews { get; set; } = new List<CrmCallReview>();

    public virtual ICollection<CrmCampaignMember> CrmCampaignMembers { get; set; } = new List<CrmCampaignMember>();

    public virtual ICollection<CrmLeadAssignment> CrmLeadAssignments { get; set; } = new List<CrmLeadAssignment>();

    public virtual ICollection<CrmLeadConversion> CrmLeadConversions { get; set; } = new List<CrmLeadConversion>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmLeadKpisnapshot> CrmLeadKpisnapshots { get; set; } = new List<CrmLeadKpisnapshot>();

    public virtual ICollection<CrmLeadQualification> CrmLeadQualifications { get; set; } = new List<CrmLeadQualification>();

    public virtual ICollection<CrmLeadStatusHistory> CrmLeadStatusHistories { get; set; } = new List<CrmLeadStatusHistory>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmNote> CrmNotes { get; set; } = new List<CrmNote>();

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmReminder> CrmReminders { get; set; } = new List<CrmReminder>();

    public virtual ICollection<CrmSentimentSignal> CrmSentimentSignals { get; set; } = new List<CrmSentimentSignal>();

    public virtual ICollection<CrmTask> CrmTasks { get; set; } = new List<CrmTask>();

    public virtual CmpBrand? CrmleadBrand { get; set; }

    public virtual CmpUser? CrmleadCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? CrmleadLegalEntity { get; set; }

    public virtual OrgMaster? CrmleadOrg { get; set; }

    public virtual CmpOffice? CrmleadOrgOffice { get; set; }

    public virtual CmpUser? CrmleadOwnerUser { get; set; }

    public virtual OrgContact? CrmleadPrimaryContact { get; set; }

    public virtual SysCrmleadRating CrmleadRatingCodeNavigation { get; set; } = null!;

    public virtual SysCrmleadSource CrmleadSourceCodeNavigation { get; set; } = null!;

    public virtual SysCrmleadStatus CrmleadStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmleadUpdatedByNavigation { get; set; }
}
