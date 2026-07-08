using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowTaskAssignment
{
    public Guid WorkflowTaskAssignId { get; set; }

    public Guid WorkflowTaskAssignTaskId { get; set; }

    public string WorkflowTaskAssignAssignmentTypeCode { get; set; } = null!;

    public Guid? WorkflowTaskAssignUserId { get; set; }

    public Guid? WorkflowTaskAssignWorkQueueId { get; set; }

    public Guid? WorkflowTaskAssignRoleId { get; set; }

    public Guid? WorkflowTaskAssignGroupId { get; set; }

    public Guid? WorkflowTaskAssignOrgOfficeId { get; set; }

    public Guid? WorkflowTaskAssignExternalPartyOrgId { get; set; }

    public bool WorkflowTaskAssignIsPrimary { get; set; }

    public DateTime WorkflowTaskAssignAssignedAt { get; set; }

    public Guid? WorkflowTaskAssignAssignedBy { get; set; }

    public DateTime? WorkflowTaskAssignAcceptedAt { get; set; }

    public DateTime? WorkflowTaskAssignReleasedAt { get; set; }

    public Guid? WorkflowTaskAssignReleasedBy { get; set; }

    public string? WorkflowTaskAssignReleaseReason { get; set; }

    public virtual CmpUser? WorkflowTaskAssignAssignedByNavigation { get; set; }

    public virtual SysWorkflowAssignmentType WorkflowTaskAssignAssignmentTypeCodeNavigation { get; set; } = null!;

    public virtual CmpGroup? WorkflowTaskAssignGroup { get; set; }

    public virtual CmpOffice? WorkflowTaskAssignOrgOffice { get; set; }

    public virtual CmpUser? WorkflowTaskAssignReleasedByNavigation { get; set; }

    public virtual SysUserRole? WorkflowTaskAssignRole { get; set; }

    public virtual WorkflowTask WorkflowTaskAssignTask { get; set; } = null!;

    public virtual CmpUser? WorkflowTaskAssignUser { get; set; }

    public virtual WorkflowWorkQueue? WorkflowTaskAssignWorkQueue { get; set; }
}
