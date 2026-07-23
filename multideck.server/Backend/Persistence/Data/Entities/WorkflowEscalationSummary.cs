using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowEscalationSummary
{
    public Guid? WorkflowEscId { get; set; }

    public Guid? WorkflowEscInstanceId { get; set; }

    public Guid? WorkflowEscTaskId { get; set; }

    public Guid? WorkflowEscApprovalId { get; set; }

    public string? WorkflowEscRecordTypeCode { get; set; }

    public Guid? WorkflowEscRecordId { get; set; }

    public string? WorkflowEscStatusCode { get; set; }

    public bool? WorkflowEscStatusIsOpen { get; set; }

    public string? WorkflowEscSeverityCode { get; set; }

    public string? WorkflowEscTitle { get; set; }

    public DateTime? WorkflowEscEscalatedAt { get; set; }

    public Guid? WorkflowEscEscalatedBy { get; set; }

    public string? WorkflowEscEscalatedByEmail { get; set; }

    public Guid? WorkflowEscEscalatedToUserId { get; set; }

    public string? WorkflowEscEscalatedToUserEmail { get; set; }

    public Guid? WorkflowEscEscalatedToRoleId { get; set; }

    public Guid? WorkflowEscEscalatedToQueueId { get; set; }

    public string? WorkflowEscEscalatedToQueueName { get; set; }

    public DateTime? WorkflowEscAcknowledgedAt { get; set; }

    public DateTime? WorkflowEscResolvedAt { get; set; }
}
