using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsorderStatus
{
    public string WmsorderStatusCode { get; set; } = null!;

    public string WmsorderStatusName { get; set; } = null!;

    public string? WmsorderStatusDescription { get; set; }

    public bool WmsorderStatusIsOpen { get; set; }

    public bool WmsorderStatusIsFinal { get; set; }

    public bool WmsorderStatusIsActive { get; set; }

    public int WmsorderStatusSortOrder { get; set; }

    public virtual ICollection<WmsOrder> WmsOrders { get; set; } = new List<WmsOrder>();
}
