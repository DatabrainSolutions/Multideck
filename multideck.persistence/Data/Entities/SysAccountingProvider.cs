using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAccountingProvider
{
    public string AccpCode { get; set; } = null!;

    public string AccpName { get; set; } = null!;

    public string? AccpDescription { get; set; }

    public bool AccpIsCloud { get; set; }

    public bool AccpRequiresLocalAgent { get; set; }

    public string AccpDefaultAuthType { get; set; } = null!;

    public int AccpSortOrder { get; set; }

    public bool AccpIsActive { get; set; }

    public DateTime AccpCreatedAt { get; set; }

    public virtual ICollection<AcciConnection> AcciConnections { get; set; } = new List<AcciConnection>();

    public virtual ICollection<AcciWebhookEvent> AcciWebhookEvents { get; set; } = new List<AcciWebhookEvent>();
}
