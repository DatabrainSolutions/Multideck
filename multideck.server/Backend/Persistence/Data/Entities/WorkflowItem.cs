using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowItem
{
    public Guid WorkflowId { get; set; }

    public string? WorkflowRecordType { get; set; }

    public Guid WorkflowRecordId { get; set; }

    public string? WorkflowTaskDescription { get; set; }

    public int? WorkflowTaskType { get; set; }

    public int? WorkflowTaskStatus { get; set; }

    public Guid? WorkflowAssignedUser { get; set; }

    public DateTime? WorkflowDueDate { get; set; }

    public DateTime? WorkflowCompletedDate { get; set; }

    public Guid? WorkflowCompletedUser { get; set; }

    public string? WorkflowNotes { get; set; }

    public Guid? WorkflowDependsOn { get; set; }

    public DateTime? WorkflowCreatedDate { get; set; }

    public Guid? WorkflowCreatedUser { get; set; }
}
