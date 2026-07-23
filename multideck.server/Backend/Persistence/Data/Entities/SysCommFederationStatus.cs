using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommFederationStatus
{
    public string CommFedStatusCode { get; set; } = null!;

    public string CommFedStatusName { get; set; } = null!;

    public string? CommFedStatusDescription { get; set; }

    public bool CommFedStatusIsFinal { get; set; }

    public int CommFedStatusSortOrder { get; set; }

    public bool CommFedStatusIsActive { get; set; }

    public DateTime CommFedStatusCreatedAt { get; set; }

    public virtual ICollection<CommFederationPeer> CommFederationPeers { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommFederationSubscription> CommFederationSubscriptions { get; set; } = new List<CommFederationSubscription>();
}
