using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTaskWorklist
{
    public Guid? WorkflowTaskId { get; set; }

    public Guid? WorkflowTaskInstanceId { get; set; }

    public string? WorkflowInstName { get; set; }

    public string? WorkflowTaskTitle { get; set; }

    public string? WorkflowTaskTypeCode { get; set; }

    public string? WorkflowTaskStatusCode { get; set; }

    public bool? WorkflowTaskStatusIsOpen { get; set; }

    public string? WorkflowTaskPriorityCode { get; set; }

    public int? WorkflowPriorityWeight { get; set; }

    public string? WorkflowTaskRecordTypeCode { get; set; }

    public Guid? WorkflowTaskRecordId { get; set; }

    public Guid? WorkflowTaskOrgOfficeId { get; set; }

    public string? WorkflowTaskOfficeName { get; set; }

    public Guid? WorkflowTaskWorkQueueId { get; set; }

    public string? WorkflowQueueName { get; set; }

    public Guid? WorkflowTaskAssignedUserId { get; set; }

    public string? WorkflowTaskAssignedUserEmail { get; set; }

    public Guid? WorkflowTaskAssignedRoleId { get; set; }

    public Guid? WorkflowTaskAssignedGroupId { get; set; }

    public DateTime? WorkflowTaskDueAt { get; set; }

    public DateTime? WorkflowTaskWarningAt { get; set; }

    public DateTime? WorkflowTaskStartedAt { get; set; }

    public DateTime? WorkflowTaskCompletedAt { get; set; }

    public int? WorkflowTaskOpenBlockingDependencyCount { get; set; }

    public int? WorkflowTaskActiveSlacount { get; set; }

    public string? WorkflowTaskWorstSlastatus { get; set; }

    public DateTime? WorkflowTaskUpdatedAt { get; set; }
}
