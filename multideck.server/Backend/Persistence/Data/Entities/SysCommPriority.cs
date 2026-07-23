using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommPriority
{
    public string CommPriorityCode { get; set; } = null!;

    public string CommPriorityName { get; set; } = null!;

    public string? CommPriorityDescription { get; set; }

    public int CommPrioritySortOrder { get; set; }

    public bool CommPriorityIsActive { get; set; }

    public DateTime CommPriorityCreatedAt { get; set; }

    public virtual ICollection<CommAiclassification> CommAiclassifications { get; set; } = new List<CommAiclassification>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();
}
