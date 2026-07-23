using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommNotificationWorklist
{
    public Guid? CommNotifId { get; set; }

    public string? CommNotifStatusCode { get; set; }

    public string? CommNotifPriorityCode { get; set; }

    public Guid? CommNotifUserId { get; set; }

    public string? CommNotifUserEmail { get; set; }

    public Guid? CommNotifGroupId { get; set; }

    public Guid? CommNotifRoleId { get; set; }

    public string? CommNotifTitle { get; set; }

    public string? CommNotifBody { get; set; }

    public string? CommNotifTargetTable { get; set; }

    public Guid? CommNotifTargetId { get; set; }

    public string? CommNotifLinkTypeCode { get; set; }

    public Guid? CommNotifThreadId { get; set; }

    public Guid? CommNotifMessageId { get; set; }

    public Guid? CommNotifWorkflowTaskId { get; set; }

    public DateTime? CommNotifDueAt { get; set; }

    public DateTime? CommNotifReadAt { get; set; }

    public DateTime? CommNotifCreatedAt { get; set; }
}
