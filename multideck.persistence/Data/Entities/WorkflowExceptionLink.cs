using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowExceptionLink
{
    public Guid WorkflowExceptionLinkId { get; set; }

    public Guid? WorkflowExceptionLinkInstanceId { get; set; }

    public Guid? WorkflowExceptionLinkTaskId { get; set; }

    public Guid? WorkflowExceptionLinkJobTrackingExceptionId { get; set; }

    public string? WorkflowExceptionLinkRecordTypeCode { get; set; }

    public Guid? WorkflowExceptionLinkRecordId { get; set; }

    public string? WorkflowExceptionLinkLinkReason { get; set; }

    public bool WorkflowExceptionLinkIsPrimary { get; set; }

    public DateTime WorkflowExceptionLinkCreatedAt { get; set; }

    public Guid? WorkflowExceptionLinkCreatedBy { get; set; }

    public virtual CmpUser? WorkflowExceptionLinkCreatedByNavigation { get; set; }

    public virtual WorkflowInstance? WorkflowExceptionLinkInstance { get; set; }

    public virtual JobTrackingException? WorkflowExceptionLinkJobTrackingException { get; set; }

    public virtual SysWorkflowRecordType? WorkflowExceptionLinkRecordTypeCodeNavigation { get; set; }

    public virtual WorkflowTask? WorkflowExceptionLinkTask { get; set; }
}
