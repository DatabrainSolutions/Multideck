using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAccountingConnectionStatus
{
    public string AcccsCode { get; set; } = null!;

    public string AcccsName { get; set; } = null!;

    public bool AcccsIsFinal { get; set; }

    public int AcccsSortOrder { get; set; }

    public bool AcccsIsActive { get; set; }

    public DateTime AcccsCreatedAt { get; set; }

    public virtual ICollection<AcciConnection> AcciConnections { get; set; } = new List<AcciConnection>();

    public virtual ICollection<AcciLocalAgent> AcciLocalAgents { get; set; } = new List<AcciLocalAgent>();
}
