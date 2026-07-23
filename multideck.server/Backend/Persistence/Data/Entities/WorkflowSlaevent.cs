using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowSlaevent
{
    public Guid WorkflowSlaeventId { get; set; }

    public Guid WorkflowSlaeventTimerId { get; set; }

    public string WorkflowSlaeventEventTypeCode { get; set; } = null!;

    public string? WorkflowSlaeventStatusCode { get; set; }

    public DateTime WorkflowSlaeventEventAt { get; set; }

    public Guid? WorkflowSlaeventEventBy { get; set; }

    public string? WorkflowSlaeventNotes { get; set; }

    public string WorkflowSlaeventEventJson { get; set; } = null!;

    public virtual CmpUser? WorkflowSlaeventEventByNavigation { get; set; }

    public virtual SysWorkflowEventType WorkflowSlaeventEventTypeCodeNavigation { get; set; } = null!;

    public virtual SysWorkflowSlastatus? WorkflowSlaeventStatusCodeNavigation { get; set; }

    public virtual WorkflowSlatimer WorkflowSlaeventTimer { get; set; } = null!;
}
