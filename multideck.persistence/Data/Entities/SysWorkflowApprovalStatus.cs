using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowApprovalStatus
{
    public string WorkflowApprovalStatusCode { get; set; } = null!;

    public string WorkflowApprovalStatusName { get; set; } = null!;

    public string? WorkflowApprovalStatusDescription { get; set; }

    public bool WorkflowApprovalStatusIsOpen { get; set; }

    public bool WorkflowApprovalStatusIsActive { get; set; }

    public int WorkflowApprovalStatusSortOrder { get; set; }

    public virtual ICollection<WorkflowApprovalDecision> WorkflowApprovalDecisions { get; set; } = new List<WorkflowApprovalDecision>();

    public virtual ICollection<WorkflowApproval> WorkflowApprovals { get; set; } = new List<WorkflowApproval>();
}
