using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommDirection
{
    public string CommDirectionCode { get; set; } = null!;

    public string CommDirectionName { get; set; } = null!;

    public string? CommDirectionDescription { get; set; }

    public int CommDirectionSortOrder { get; set; }

    public bool CommDirectionIsActive { get; set; }

    public DateTime CommDirectionCreatedAt { get; set; }

    public virtual ICollection<CommFederationEnvelope> CommFederationEnvelopes { get; set; } = new List<CommFederationEnvelope>();

    public virtual ICollection<CommFederationSubscription> CommFederationSubscriptions { get; set; } = new List<CommFederationSubscription>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();
}
