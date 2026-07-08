using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmActivity
{
    public Guid CrmactivityId { get; set; }

    public string CrmactivityActivityTypeCode { get; set; } = null!;

    public string? CrmactivityOutcomeCode { get; set; }

    public Guid? CrmactivityAccountId { get; set; }

    public Guid? CrmactivityLeadId { get; set; }

    public Guid? CrmactivityOpportunityId { get; set; }

    public Guid? CrmactivityQuoteFollowupId { get; set; }

    public Guid? CrmactivityJobId { get; set; }

    public Guid? CrmactivityCommThreadId { get; set; }

    public Guid? CrmactivityCommMessageId { get; set; }

    public Guid? CrmactivityCommCallId { get; set; }

    public Guid? CrmactivityWorkflowTaskId { get; set; }

    public string CrmactivitySubject { get; set; } = null!;

    public string? CrmactivitySummary { get; set; }

    public DateTime CrmactivityActivityAt { get; set; }

    public int? CrmactivityDurationMinutes { get; set; }

    public Guid? CrmactivityOwnerUserId { get; set; }

    public bool CrmactivityIsCustomerVisible { get; set; }

    public bool CrmactivityIsTrainingAllowed { get; set; }

    public string CrmactivityMetadataJson { get; set; } = null!;

    public DateTime CrmactivityCreatedAt { get; set; }

    public Guid? CrmactivityCreatedBy { get; set; }

    public DateTime CrmactivityUpdatedAt { get; set; }

    public Guid? CrmactivityUpdatedBy { get; set; }

    public bool CrmactivityIsDeleted { get; set; }

    public virtual ICollection<CrmActivityParticipant> CrmActivityParticipants { get; set; } = new List<CrmActivityParticipant>();

    public virtual ICollection<CrmActivityWorkflowRun> CrmActivityWorkflowRuns { get; set; } = new List<CrmActivityWorkflowRun>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCampaignTouchpoint> CrmCampaignTouchpoints { get; set; } = new List<CrmCampaignTouchpoint>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual CrmAccountProfile? CrmactivityAccount { get; set; }

    public virtual SysCrmactivityType CrmactivityActivityTypeCodeNavigation { get; set; } = null!;

    public virtual CommCallLog? CrmactivityCommCall { get; set; }

    public virtual CommMessage? CrmactivityCommMessage { get; set; }

    public virtual CommThread? CrmactivityCommThread { get; set; }

    public virtual CmpUser? CrmactivityCreatedByNavigation { get; set; }

    public virtual JobHeader? CrmactivityJob { get; set; }

    public virtual CrmLead? CrmactivityLead { get; set; }

    public virtual CrmOpportunity? CrmactivityOpportunity { get; set; }

    public virtual SysCrmactivityOutcome? CrmactivityOutcomeCodeNavigation { get; set; }

    public virtual CmpUser? CrmactivityOwnerUser { get; set; }

    public virtual CrmQuoteFollowup? CrmactivityQuoteFollowup { get; set; }

    public virtual CmpUser? CrmactivityUpdatedByNavigation { get; set; }

    public virtual WorkflowTask? CrmactivityWorkflowTask { get; set; }
}
