using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommNotification
{
    public Guid CommNotifId { get; set; }

    public string CommNotifStatusCode { get; set; } = null!;

    public string CommNotifPriorityCode { get; set; } = null!;

    public Guid? CommNotifUserId { get; set; }

    public Guid? CommNotifGroupId { get; set; }

    public Guid? CommNotifRoleId { get; set; }

    public Guid? CommNotifOrgOfficeId { get; set; }

    public string CommNotifTitle { get; set; } = null!;

    public string? CommNotifBody { get; set; }

    public string? CommNotifTargetTable { get; set; }

    public Guid? CommNotifTargetId { get; set; }

    public string? CommNotifLinkTypeCode { get; set; }

    public Guid? CommNotifThreadId { get; set; }

    public Guid? CommNotifMessageId { get; set; }

    public Guid? CommNotifWorkflowTaskId { get; set; }

    public DateTime? CommNotifDueAt { get; set; }

    public DateTime? CommNotifReadAt { get; set; }

    public DateTime? CommNotifDismissedAt { get; set; }

    public DateTime? CommNotifActionedAt { get; set; }

    public string CommNotifMetadataJson { get; set; } = null!;

    public DateTime CommNotifCreatedAt { get; set; }

    public Guid? CommNotifCreatedBy { get; set; }

    public virtual CmpUser? CommNotifCreatedByNavigation { get; set; }

    public virtual CmpGroup? CommNotifGroup { get; set; }

    public virtual SysCommLinkType? CommNotifLinkTypeCodeNavigation { get; set; }

    public virtual CommMessage? CommNotifMessage { get; set; }

    public virtual CmpOffice? CommNotifOrgOffice { get; set; }

    public virtual SysCommPriority CommNotifPriorityCodeNavigation { get; set; } = null!;

    public virtual SysUserRole? CommNotifRole { get; set; }

    public virtual SysCommNotificationStatus CommNotifStatusCodeNavigation { get; set; } = null!;

    public virtual CommThread? CommNotifThread { get; set; }

    public virtual CmpUser? CommNotifUser { get; set; }

    public virtual WorkflowTask? CommNotifWorkflowTask { get; set; }
}
