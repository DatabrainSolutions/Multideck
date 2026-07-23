using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowChecklistResponseType
{
    public string WorkflowChecklistResponseTypeCode { get; set; } = null!;

    public string WorkflowChecklistResponseTypeName { get; set; } = null!;

    public string? WorkflowChecklistResponseTypeDescription { get; set; }

    public bool WorkflowChecklistResponseTypeIsActive { get; set; }

    public int WorkflowChecklistResponseTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowChecklistItem> WorkflowChecklistItems { get; set; } = new List<WorkflowChecklistItem>();
}
