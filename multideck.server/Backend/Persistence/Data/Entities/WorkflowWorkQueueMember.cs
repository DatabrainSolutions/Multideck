using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WorkflowWorkQueueMember
{
    public Guid WorkflowQueueMemberId { get; set; }

    public Guid WorkflowQueueMemberQueueId { get; set; }

    public Guid? WorkflowQueueMemberUserId { get; set; }

    public Guid? WorkflowQueueMemberGroupId { get; set; }

    public Guid? WorkflowQueueMemberRoleId { get; set; }

    public Guid? WorkflowQueueMemberOrgOfficeId { get; set; }

    public bool WorkflowQueueMemberIsManager { get; set; }

    public bool WorkflowQueueMemberIsActive { get; set; }

    public DateTime WorkflowQueueMemberCreatedAt { get; set; }

    public Guid? WorkflowQueueMemberCreatedBy { get; set; }

    public virtual CmpUser? WorkflowQueueMemberCreatedByNavigation { get; set; }

    public virtual CmpGroup? WorkflowQueueMemberGroup { get; set; }

    public virtual CmpOffice? WorkflowQueueMemberOrgOffice { get; set; }

    public virtual WorkflowWorkQueue WorkflowQueueMemberQueue { get; set; } = null!;

    public virtual SysUserRole? WorkflowQueueMemberRole { get; set; }

    public virtual CmpUser? WorkflowQueueMemberUser { get; set; }
}
