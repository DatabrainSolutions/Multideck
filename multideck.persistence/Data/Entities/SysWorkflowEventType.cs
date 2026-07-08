using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowEventType
{
    public string WorkflowEventTypeCode { get; set; } = null!;

    public string WorkflowEventTypeName { get; set; } = null!;

    public string? WorkflowEventTypeDescription { get; set; }

    public bool WorkflowEventTypeIsActive { get; set; }

    public int WorkflowEventTypeSortOrder { get; set; }

    public virtual ICollection<WorkflowEvent> WorkflowEvents { get; set; } = new List<WorkflowEvent>();

    public virtual ICollection<WorkflowSlaevent> WorkflowSlaevents { get; set; } = new List<WorkflowSlaevent>();
}
