using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommNotificationStatus
{
    public string CommNotificationStatusCode { get; set; } = null!;

    public string CommNotificationStatusName { get; set; } = null!;

    public string? CommNotificationStatusDescription { get; set; }

    public bool CommNotificationStatusIsFinal { get; set; }

    public int CommNotificationStatusSortOrder { get; set; }

    public bool CommNotificationStatusIsActive { get; set; }

    public DateTime CommNotificationStatusCreatedAt { get; set; }

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();
}
