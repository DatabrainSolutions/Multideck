using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingEventLink
{
    public Guid JobTrackEventLinkId { get; set; }

    public Guid JobTrackEventLinkEventId { get; set; }

    public string JobTrackEventLinkTargetTable { get; set; } = null!;

    public Guid JobTrackEventLinkTargetId { get; set; }

    public string? JobTrackEventLinkRole { get; set; }

    public DateTime JobTrackEventLinkCreatedAt { get; set; }

    public virtual JobTrackingEvent JobTrackEventLinkEvent { get; set; } = null!;
}
