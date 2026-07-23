using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWorkflowSlastatus
{
    public string WorkflowSlastatusCode { get; set; } = null!;

    public string WorkflowSlastatusName { get; set; } = null!;

    public string? WorkflowSlastatusDescription { get; set; }

    public bool WorkflowSlastatusIsActive { get; set; }

    public int WorkflowSlastatusSortOrder { get; set; }

    public virtual ICollection<WorkflowSlaevent> WorkflowSlaevents { get; set; } = new List<WorkflowSlaevent>();

    public virtual ICollection<WorkflowSlatimer> WorkflowSlatimers { get; set; } = new List<WorkflowSlatimer>();
}
