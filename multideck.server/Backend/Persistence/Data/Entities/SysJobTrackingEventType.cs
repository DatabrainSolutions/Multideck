using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTrackingEventType
{
    public string JtetCode { get; set; } = null!;

    public string JtetName { get; set; } = null!;

    public string? JtetDescription { get; set; }

    public int JtetSortOrder { get; set; }

    public bool JtetIsActive { get; set; }

    public DateTime JtetCreatedAt { get; set; }

    public virtual ICollection<JobTrackingEvent> JobTrackingEvents { get; set; } = new List<JobTrackingEvent>();
}
