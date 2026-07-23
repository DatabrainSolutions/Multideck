using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciLocalAgent
{
    public Guid AccilaId { get; set; }

    public Guid AccilaConnectionId { get; set; }

    public string AccilaAgentName { get; set; } = null!;

    public string AccilaAgentType { get; set; } = null!;

    public string AccilaStatusCode { get; set; } = null!;

    public string AccilaPairingRef { get; set; } = null!;

    public string? AccilaVersion { get; set; }

    public string? AccilaHostNameSnapshot { get; set; }

    public DateTime? AccilaLastHeartbeatAt { get; set; }

    public string? AccilaLastErrorText { get; set; }

    public string AccilaSettingsJson { get; set; } = null!;

    public DateTime AccilaCreatedAt { get; set; }

    public DateTime AccilaUpdatedAt { get; set; }

    public virtual AcciConnection AccilaConnection { get; set; } = null!;

    public virtual SysAccountingConnectionStatus AccilaStatusCodeNavigation { get; set; } = null!;
}
