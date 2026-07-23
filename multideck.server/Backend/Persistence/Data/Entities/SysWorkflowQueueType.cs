using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowQueueType
{
    public string WorkflowQueueTypeCode { get; set; } = null!;

    public string WorkflowQueueTypeName { get; set; } = null!;

    public string? WorkflowQueueTypeDescription { get; set; }

    public bool WorkflowQueueTypeIsActive { get; set; }

    public int WorkflowQueueTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowWorkQueue> WorkflowWorkQueues { get; set; } = new List<WorkflowWorkQueue>();
}
