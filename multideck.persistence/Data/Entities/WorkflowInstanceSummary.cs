using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowInstanceSummary
{
    public Guid? WorkflowInstId { get; set; }

    public string? WorkflowInstName { get; set; }

    public string? WorkflowInstStatusCode { get; set; }

    public string? WorkflowInstPrimaryRecordTypeCode { get; set; }

    public Guid? WorkflowInstPrimaryRecordId { get; set; }

    public Guid? WorkflowInstOrgOfficeId { get; set; }

    public string? WorkflowInstOfficeName { get; set; }

    public string? WorkflowInstPriorityCode { get; set; }

    public DateTime? WorkflowInstStartedAt { get; set; }

    public DateTime? WorkflowInstDueAt { get; set; }

    public DateTime? WorkflowInstCompletedAt { get; set; }

    public Guid? WorkflowInstDefinitionId { get; set; }

    public string? WorkflowDefCode { get; set; }

    public string? WorkflowDefName { get; set; }

    public int? WorkflowInstTaskCount { get; set; }

    public int? WorkflowInstOpenTaskCount { get; set; }

    public int? WorkflowInstOpenApprovalCount { get; set; }

    public int? WorkflowInstOpenEscalationCount { get; set; }

    public DateTime? WorkflowInstNextTaskDueAt { get; set; }

    public DateTime? WorkflowInstUpdatedAt { get; set; }
}
