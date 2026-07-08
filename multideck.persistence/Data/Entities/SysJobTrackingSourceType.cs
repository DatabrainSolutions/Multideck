using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTrackingSourceType
{
    public string JtstCode { get; set; } = null!;

    public string JtstName { get; set; } = null!;

    public string? JtstDescription { get; set; }

    public int JtstSortOrder { get; set; }

    public bool JtstIsActive { get; set; }

    public DateTime JtstCreatedAt { get; set; }

    public virtual ICollection<JobTrackingApiConnection> JobTrackingApiConnections { get; set; } = new List<JobTrackingApiConnection>();

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();
}
