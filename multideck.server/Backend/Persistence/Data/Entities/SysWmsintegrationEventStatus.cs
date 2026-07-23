using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsintegrationEventStatus
{
    public string WmsintegrationStatusCode { get; set; } = null!;

    public string WmsintegrationStatusName { get; set; } = null!;

    public string? WmsintegrationStatusDescription { get; set; }

    public bool WmsintegrationStatusIsFinal { get; set; }

    public bool WmsintegrationStatusIsActive { get; set; }

    public int WmsintegrationStatusSortOrder { get; set; }

    public virtual ICollection<WmsIntegrationEvent> WmsIntegrationEvents { get; set; } = new List<WmsIntegrationEvent>();
}
