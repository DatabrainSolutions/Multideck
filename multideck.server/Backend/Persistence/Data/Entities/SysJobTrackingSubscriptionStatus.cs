using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTrackingSubscriptionStatus
{
    public string JtssCode { get; set; } = null!;

    public string JtssName { get; set; } = null!;

    public string? JtssDescription { get; set; }

    public bool JtssIsFinal { get; set; }

    public int JtssSortOrder { get; set; }

    public bool JtssIsActive { get; set; }

    public DateTime JtssCreatedAt { get; set; }

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();
}
