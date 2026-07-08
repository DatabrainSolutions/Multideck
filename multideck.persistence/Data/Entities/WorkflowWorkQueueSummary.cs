using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowWorkQueueSummary
{
    public Guid? WorkflowQueueId { get; set; }

    public string? WorkflowQueueCode { get; set; }

    public string? WorkflowQueueName { get; set; }

    public string? WorkflowQueueTypeCode { get; set; }

    public Guid? WorkflowQueueOrgOfficeId { get; set; }

    public string? WorkflowQueueOfficeName { get; set; }

    public Guid? WorkflowQueueManagerUserId { get; set; }

    public string? WorkflowQueueManagerEmail { get; set; }

    public bool? WorkflowQueueIsActive { get; set; }

    public int? WorkflowQueueActiveMemberCount { get; set; }

    public int? WorkflowQueueOpenTaskCount { get; set; }

    public DateTime? WorkflowQueueNextTaskDueAt { get; set; }
}
