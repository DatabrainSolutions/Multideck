using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysTceeventStatus
{
    public string TceeventStatusCode { get; set; } = null!;

    public string TceeventStatusName { get; set; } = null!;

    public string? TceeventStatusDescription { get; set; }

    public bool TceeventStatusIsOpen { get; set; }

    public bool TceeventStatusIsFinal { get; set; }

    public bool TceeventStatusIsActive { get; set; }

    public int TceeventStatusSortOrder { get; set; }

    public virtual ICollection<TceIntegrationEvent> TceIntegrationEvents { get; set; } = new List<TceIntegrationEvent>();
}
