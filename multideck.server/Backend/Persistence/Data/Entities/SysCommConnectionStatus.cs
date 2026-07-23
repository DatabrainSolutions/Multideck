using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommConnectionStatus
{
    public string CommConnectionStatusCode { get; set; } = null!;

    public string CommConnectionStatusName { get; set; } = null!;

    public string? CommConnectionStatusDescription { get; set; }

    public bool CommConnectionStatusIsActive { get; set; }

    public DateTime CommConnectionStatusCreatedAt { get; set; }

    public virtual ICollection<CommProviderConnection> CommProviderConnections { get; set; } = new List<CommProviderConnection>();
}
