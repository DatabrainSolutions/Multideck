using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommThread
{
    public Guid CommThreadId { get; set; }

    public string? CommThreadSubject { get; set; }

    public string? CommThreadNormalizedSubject { get; set; }

    public string? CommThreadSummary { get; set; }

    public string CommThreadPrimaryChannelCode { get; set; } = null!;

    public string CommThreadStatusCode { get; set; } = null!;

    public string CommThreadPriorityCode { get; set; } = null!;

    public string CommThreadSensitivityCode { get; set; } = null!;

    public string CommThreadSourceTypeCode { get; set; } = null!;

    public Guid? CommThreadOrgOfficeId { get; set; }

    public Guid? CommThreadLegalEntityId { get; set; }

    public Guid? CommThreadBrandId { get; set; }

    public Guid? CommThreadCustomerOrgId { get; set; }

    public Guid? CommThreadOwnerUserId { get; set; }

    public Guid? CommThreadAssignedUserId { get; set; }

    public Guid? CommThreadAssignedGroupId { get; set; }

    public string? CommThreadPrimaryTargetTable { get; set; }

    public Guid? CommThreadPrimaryTargetId { get; set; }

    public string? CommThreadPrimaryRecordTypeCode { get; set; }

    public Guid? CommThreadWorkflowInstanceId { get; set; }

    public Guid? CommThreadLastMessageId { get; set; }

    public DateTime CommThreadStartedAt { get; set; }

    public DateTime? CommThreadLastMessageAt { get; set; }

    public DateTime? CommThreadFirstResponseDueAt { get; set; }

    public DateTime? CommThreadNextActionDueAt { get; set; }

    public DateTime? CommThreadResolvedAt { get; set; }

    public DateTime? CommThreadClosedAt { get; set; }

    public string? CommThreadAiintent { get; set; }

    public string? CommThreadAisummary { get; set; }

    public bool CommThreadIsConfidential { get; set; }

    public bool CommThreadIsReadOnly { get; set; }

    public string CommThreadMetadataJson { get; set; } = null!;

    public DateTime CommThreadCreatedAt { get; set; }

    public Guid? CommThreadCreatedBy { get; set; }

    public DateTime CommThreadUpdatedAt { get; set; }

    public Guid? CommThreadUpdatedBy { get; set; }

    public bool CommThreadIsDeleted { get; set; }

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmInsuranceNotification> ClmInsuranceNotifications { get; set; } = new List<ClmInsuranceNotification>();

    public virtual ICollection<CommAiclassification> CommAiclassifications { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommExtractedEntity> CommExtractedEntities { get; set; } = new List<CommExtractedEntity>();

    public virtual ICollection<CommFederationEnvelope> CommFederationEnvelopes { get; set; } = new List<CommFederationEnvelope>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommReadState> CommReadStates { get; set; } = new List<CommReadState>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual CmpGroup? CommThreadAssignedGroup { get; set; }

    public virtual CmpUser? CommThreadAssignedUser { get; set; }

    public virtual ICollection<CommThreadAssignment> CommThreadAssignments { get; set; } = new List<CommThreadAssignment>();

    public virtual CmpBrand? CommThreadBrand { get; set; }

    public virtual CmpUser? CommThreadCreatedByNavigation { get; set; }

    public virtual OrgMaster? CommThreadCustomerOrg { get; set; }

    public virtual CommMessage? CommThreadLastMessage { get; set; }

    public virtual CmpLegalEntity? CommThreadLegalEntity { get; set; }

    public virtual ICollection<CommThreadLink> CommThreadLinks { get; set; } = new List<CommThreadLink>();

    public virtual CmpOffice? CommThreadOrgOffice { get; set; }

    public virtual CmpUser? CommThreadOwnerUser { get; set; }

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();

    public virtual SysCommChannel CommThreadPrimaryChannelCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? CommThreadPrimaryRecordTypeCodeNavigation { get; set; }

    public virtual SysCommPriority CommThreadPriorityCodeNavigation { get; set; } = null!;

    public virtual SysCommSensitivityLevel CommThreadSensitivityCodeNavigation { get; set; } = null!;

    public virtual SysCommSourceType CommThreadSourceTypeCodeNavigation { get; set; } = null!;

    public virtual SysCommThreadStatus CommThreadStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommThreadUpdatedByNavigation { get; set; }

    public virtual WorkflowInstance? CommThreadWorkflowInstance { get; set; }

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmInboundReplyMatch> CrmInboundReplyMatches { get; set; } = new List<CrmInboundReplyMatch>();

    public virtual ICollection<CrmLeadInteraction> CrmLeadInteractions { get; set; } = new List<CrmLeadInteraction>();

    public virtual ICollection<CrmMarketFeedbackItem> CrmMarketFeedbackItems { get; set; } = new List<CrmMarketFeedbackItem>();

    public virtual ICollection<CrmQuoteFollowupAttempt> CrmQuoteFollowupAttempts { get; set; } = new List<CrmQuoteFollowupAttempt>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActions { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinDebtAction> FinDebtActions { get; set; } = new List<FinDebtAction>();

    public virtual ICollection<FinDunningItem> FinDunningItems { get; set; } = new List<FinDunningItem>();

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();
}
