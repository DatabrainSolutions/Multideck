using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommTrustLevel
{
    public string CommTrustLevelCode { get; set; } = null!;

    public string CommTrustLevelName { get; set; } = null!;

    public string? CommTrustLevelDescription { get; set; }

    public int CommTrustLevelSortOrder { get; set; }

    public bool CommTrustLevelIsActive { get; set; }

    public DateTime CommTrustLevelCreatedAt { get; set; }

    public virtual ICollection<CommFederationPeer> CommFederationPeers { get; set; } = new List<CommFederationPeer>();
}
