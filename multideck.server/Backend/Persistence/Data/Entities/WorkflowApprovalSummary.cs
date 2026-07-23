using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowApprovalSummary
{
    public Guid? WorkflowApprovalId { get; set; }

    public Guid? WorkflowApprovalInstanceId { get; set; }

    public Guid? WorkflowApprovalTaskId { get; set; }

    public string? WorkflowApprovalRecordTypeCode { get; set; }

    public Guid? WorkflowApprovalRecordId { get; set; }

    public string? WorkflowApprovalTitle { get; set; }

    public string? WorkflowApprovalStatusCode { get; set; }

    public bool? WorkflowApprovalStatusIsOpen { get; set; }

    public string? WorkflowApprovalPriorityCode { get; set; }

    public Guid? WorkflowApprovalRequestedBy { get; set; }

    public string? WorkflowApprovalRequestedByEmail { get; set; }

    public DateTime? WorkflowApprovalRequestedAt { get; set; }

    public DateTime? WorkflowApprovalDueAt { get; set; }

    public Guid? WorkflowApprovalCurrentApproverUserId { get; set; }

    public string? WorkflowApprovalCurrentApproverEmail { get; set; }

    public Guid? WorkflowApprovalCurrentApproverRoleId { get; set; }

    public int? WorkflowApprovalDecisionCount { get; set; }

    public DateTime? WorkflowApprovalLastDecisionAt { get; set; }

    public DateTime? WorkflowApprovalFinalDecisionAt { get; set; }
}
