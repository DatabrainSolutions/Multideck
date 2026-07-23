using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsorderLineStatus
{
    public string WmsorderLineStatusCode { get; set; } = null!;

    public string WmsorderLineStatusName { get; set; } = null!;

    public string? WmsorderLineStatusDescription { get; set; }

    public bool WmsorderLineStatusIsOpen { get; set; }

    public bool WmsorderLineStatusIsFinal { get; set; }

    public bool WmsorderLineStatusIsActive { get; set; }

    public int WmsorderLineStatusSortOrder { get; set; }

    public virtual ICollection<WmsOrderLine> WmsOrderLines { get; set; } = new List<WmsOrderLine>();
}
