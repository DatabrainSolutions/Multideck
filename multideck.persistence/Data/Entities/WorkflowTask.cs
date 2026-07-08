using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTask
{
    public Guid WorkflowTaskId { get; set; }

    public Guid? WorkflowTaskInstanceId { get; set; }

    public Guid? WorkflowTaskStepId { get; set; }

    public string? WorkflowTaskCode { get; set; }

    public string WorkflowTaskTitle { get; set; } = null!;

    public string? WorkflowTaskDescription { get; set; }

    public string WorkflowTaskTypeCode { get; set; } = null!;

    public string WorkflowTaskStatusCode { get; set; } = null!;

    public string WorkflowTaskPriorityCode { get; set; } = null!;

    public string? WorkflowTaskRecordTypeCode { get; set; }

    public Guid? WorkflowTaskRecordId { get; set; }

    public Guid? WorkflowTaskOrgOfficeId { get; set; }

    public Guid? WorkflowTaskLegalEntityId { get; set; }

    public Guid? WorkflowTaskBrandId { get; set; }

    public Guid? WorkflowTaskWorkQueueId { get; set; }

    public Guid? WorkflowTaskAssignedUserId { get; set; }

    public Guid? WorkflowTaskAssignedRoleId { get; set; }

    public Guid? WorkflowTaskAssignedGroupId { get; set; }

    public DateTime? WorkflowTaskDueAt { get; set; }

    public DateTime? WorkflowTaskWarningAt { get; set; }

    public DateTime? WorkflowTaskStartedAt { get; set; }

    public DateTime? WorkflowTaskCompletedAt { get; set; }

    public Guid? WorkflowTaskCompletedBy { get; set; }

    public DateTime? WorkflowTaskCancelledAt { get; set; }

    public Guid? WorkflowTaskCancelledBy { get; set; }

    public string? WorkflowTaskCancellationReason { get; set; }

    public bool WorkflowTaskIsBlocking { get; set; }

    public bool WorkflowTaskIsSystemGenerated { get; set; }

    public string? WorkflowTaskSourceTriggerTypeCode { get; set; }

    public Guid? WorkflowTaskSourceAiTaskRunId { get; set; }

    public string WorkflowTaskContextJson { get; set; } = null!;

    public DateTime WorkflowTaskCreatedAt { get; set; }

    public Guid? WorkflowTaskCreatedBy { get; set; }

    public DateTime WorkflowTaskUpdatedAt { get; set; }

    public Guid? WorkflowTaskUpdatedBy { get; set; }

    public bool WorkflowTaskIsDeleted { get; set; }

    public virtual ICollection<ClmAiinsight> ClmAiinsights { get; set; } = new List<ClmAiinsight>();

    public virtual ICollection<ClmClaimApproval> ClmClaimApprovals { get; set; } = new List<ClmClaimApproval>();

    public virtual ICollection<ClmClaimEvent> ClmClaimEvents { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActions { get; set; } = new List<ClmIncidentAction>();

    public virtual ICollection<ClmPolicyRenewal> ClmPolicyRenewals { get; set; } = new List<ClmPolicyRenewal>();

    public virtual ICollection<ClmSurveyAppointment> ClmSurveyAppointments { get; set; } = new List<ClmSurveyAppointment>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CrmActivity> CrmActivities { get; set; } = new List<CrmActivity>();

    public virtual ICollection<CrmAutomationRun> CrmAutomationRuns { get; set; } = new List<CrmAutomationRun>();

    public virtual ICollection<CrmCallActionCandidate> CrmCallActionCandidates { get; set; } = new List<CrmCallActionCandidate>();

    public virtual ICollection<CrmNextBestAction> CrmNextBestActions { get; set; } = new List<CrmNextBestAction>();

    public virtual ICollection<CrmOnboardingTask> CrmOnboardingTasks { get; set; } = new List<CrmOnboardingTask>();

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();

    public virtual ICollection<CrmQuoteFollowupSchedule> CrmQuoteFollowupSchedules { get; set; } = new List<CrmQuoteFollowupSchedule>();

    public virtual CrmTask? CrmTask { get; set; }

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<FinAiinsightAction> FinAiinsightActions { get; set; } = new List<FinAiinsightAction>();

    public virtual ICollection<FinCreditHold> FinCreditHolds { get; set; } = new List<FinCreditHold>();

    public virtual ICollection<MdxInboundReviewItem> MdxInboundReviewItems { get; set; } = new List<MdxInboundReviewItem>();

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCase> TceComplianceCases { get; set; } = new List<TceComplianceCase>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceComplianceHold> TceComplianceHolds { get; set; } = new List<TceComplianceHold>();

    public virtual ICollection<TceReleaseGate> TceReleaseGates { get; set; } = new List<TceReleaseGate>();

    public virtual ICollection<WmsAdjustment> WmsAdjustments { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsReceiptDiscrepancy> WmsReceiptDiscrepancies { get; set; } = new List<WmsReceiptDiscrepancy>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();

    public virtual ICollection<WorkflowAutomationRun> WorkflowAutomationRuns { get; set; } = new List<WorkflowAutomationRun>();

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowExceptionLink> WorkflowExceptionLinks { get; set; } = new List<WorkflowExceptionLink>();

    public virtual ICollection<WorkflowHandoff> WorkflowHandoffs { get; set; } = new List<WorkflowHandoff>();

    public virtual ICollection<WorkflowLegacyLink> WorkflowLegacyLinks { get; set; } = new List<WorkflowLegacyLink>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();

    public virtual CmpGroup? WorkflowTaskAssignedGroup { get; set; }

    public virtual SysUserRole? WorkflowTaskAssignedRole { get; set; }

    public virtual CmpUser? WorkflowTaskAssignedUser { get; set; }

    public virtual ICollection<WorkflowTaskAssignment> WorkflowTaskAssignments { get; set; } = new List<WorkflowTaskAssignment>();

    public virtual CmpBrand? WorkflowTaskBrand { get; set; }

    public virtual CmpUser? WorkflowTaskCancelledByNavigation { get; set; }

    public virtual ICollection<WorkflowTaskChecklistResponse> WorkflowTaskChecklistResponses { get; set; } = new List<WorkflowTaskChecklistResponse>();

    public virtual CmpUser? WorkflowTaskCompletedByNavigation { get; set; }

    public virtual CmpUser? WorkflowTaskCreatedByNavigation { get; set; }

    public virtual ICollection<WorkflowTaskDependency> WorkflowTaskDependencyWorkflowTaskDepDependsOnTasks { get; set; } = new List<WorkflowTaskDependency>();

    public virtual ICollection<WorkflowTaskDependency> WorkflowTaskDependencyWorkflowTaskDepTasks { get; set; } = new List<WorkflowTaskDependency>();

    public virtual WorkflowInstance? WorkflowTaskInstance { get; set; }

    public virtual CmpLegalEntity? WorkflowTaskLegalEntity { get; set; }

    public virtual CmpOffice? WorkflowTaskOrgOffice { get; set; }

    public virtual SysWorkflowPriority WorkflowTaskPriorityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? WorkflowTaskRecordTypeCodeNavigation { get; set; }

    public virtual AiTaskRun? WorkflowTaskSourceAiTaskRun { get; set; }

    public virtual SysWorkflowTriggerType? WorkflowTaskSourceTriggerTypeCodeNavigation { get; set; }

    public virtual SysWorkflowTaskStatus WorkflowTaskStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowStep? WorkflowTaskStep { get; set; }

    public virtual SysWorkflowTaskType WorkflowTaskTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WorkflowTaskUpdatedByNavigation { get; set; }

    public virtual WorkflowWorkQueue? WorkflowTaskWorkQueue { get; set; }
}
