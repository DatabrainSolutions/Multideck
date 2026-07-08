using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowInstanceTarget
{
    public Guid WorkflowTargetId { get; set; }

    public Guid WorkflowTargetInstanceId { get; set; }

    public string WorkflowTargetRecordTypeCode { get; set; } = null!;

    public Guid WorkflowTargetRecordId { get; set; }

    public string? WorkflowTargetSourceTable { get; set; }

    public string WorkflowTargetRelationshipCode { get; set; } = null!;

    public bool WorkflowTargetIsPrimary { get; set; }

    public DateTime WorkflowTargetAddedAt { get; set; }

    public Guid? WorkflowTargetAddedBy { get; set; }

    public virtual CmpUser? WorkflowTargetAddedByNavigation { get; set; }

    public virtual WorkflowInstance WorkflowTargetInstance { get; set; } = null!;

    public virtual SysWorkflowRecordType WorkflowTargetRecordTypeCodeNavigation { get; set; } = null!;
}
