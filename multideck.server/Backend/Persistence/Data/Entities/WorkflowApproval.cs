using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowApproval
{
    public Guid WorkflowApprovalId { get; set; }

    public Guid? WorkflowApprovalInstanceId { get; set; }

    public Guid? WorkflowApprovalTaskId { get; set; }

    public string? WorkflowApprovalRecordTypeCode { get; set; }

    public Guid? WorkflowApprovalRecordId { get; set; }

    public string WorkflowApprovalTitle { get; set; } = null!;

    public string? WorkflowApprovalDescription { get; set; }

    public string WorkflowApprovalStatusCode { get; set; } = null!;

    public string WorkflowApprovalPriorityCode { get; set; } = null!;

    public Guid? WorkflowApprovalRequestedBy { get; set; }

    public DateTime WorkflowApprovalRequestedAt { get; set; }

    public DateTime? WorkflowApprovalDueAt { get; set; }

    public DateTime? WorkflowApprovalFinalDecisionAt { get; set; }

    public Guid? WorkflowApprovalFinalDecisionBy { get; set; }

    public int WorkflowApprovalMinimumApprovals { get; set; }

    public bool WorkflowApprovalRequiresAllApprovers { get; set; }

    public Guid? WorkflowApprovalCurrentApproverUserId { get; set; }

    public Guid? WorkflowApprovalCurrentApproverRoleId { get; set; }

    public string WorkflowApprovalContextJson { get; set; } = null!;

    public DateTime WorkflowApprovalCreatedAt { get; set; }

    public Guid? WorkflowApprovalCreatedBy { get; set; }

    public virtual CmpUser? WorkflowApprovalCreatedByNavigation { get; set; }

    public virtual SysUserRole? WorkflowApprovalCurrentApproverRole { get; set; }

    public virtual CmpUser? WorkflowApprovalCurrentApproverUser { get; set; }

    public virtual ICollection<WorkflowApprovalDecision> WorkflowApprovalDecisions { get; set; } = new List<WorkflowApprovalDecision>();

    public virtual CmpUser? WorkflowApprovalFinalDecisionByNavigation { get; set; }

    public virtual WorkflowInstance? WorkflowApprovalInstance { get; set; }

    public virtual SysWorkflowPriority WorkflowApprovalPriorityCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowRecordType? WorkflowApprovalRecordTypeCodeNavigation { get; set; }

    public virtual CmpUser? WorkflowApprovalRequestedByNavigation { get; set; }

    public virtual SysWorkflowApprovalStatus WorkflowApprovalStatusCodeNavigation { get; set; } = null!;

    public virtual WorkflowTask? WorkflowApprovalTask { get; set; }

    public virtual ICollection<WorkflowEscalation> WorkflowEscalations { get; set; } = new List<WorkflowEscalation>();

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();
}
