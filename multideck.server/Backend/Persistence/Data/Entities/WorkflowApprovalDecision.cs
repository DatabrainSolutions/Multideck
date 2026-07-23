using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowApprovalDecision
{
    public Guid WorkflowApprovalDecisionId { get; set; }

    public Guid WorkflowApprovalDecisionApprovalId { get; set; }

    public string WorkflowApprovalDecisionStatusCode { get; set; } = null!;

    public Guid? WorkflowApprovalDecisionDecidedBy { get; set; }

    public DateTime WorkflowApprovalDecisionDecidedAt { get; set; }

    public Guid? WorkflowApprovalDecisionDelegatedToUserId { get; set; }

    public Guid? WorkflowApprovalDecisionDelegatedToRoleId { get; set; }

    public string? WorkflowApprovalDecisionReason { get; set; }

    public string? WorkflowApprovalDecisionComment { get; set; }

    public string WorkflowApprovalDecisionDecisionJson { get; set; } = null!;

    public virtual WorkflowApproval WorkflowApprovalDecisionApproval { get; set; } = null!;

    public virtual CmpUser? WorkflowApprovalDecisionDecidedByNavigation { get; set; }

    public virtual SysUserRole? WorkflowApprovalDecisionDelegatedToRole { get; set; }

    public virtual CmpUser? WorkflowApprovalDecisionDelegatedToUser { get; set; }

    public virtual SysWorkflowApprovalStatus WorkflowApprovalDecisionStatusCodeNavigation { get; set; } = null!;
}
