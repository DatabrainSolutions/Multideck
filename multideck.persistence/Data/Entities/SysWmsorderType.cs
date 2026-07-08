using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsorderType
{
    public string WmsorderTypeCode { get; set; } = null!;

    public string WmsorderTypeName { get; set; } = null!;

    public string? WmsorderTypeDescription { get; set; }

    public string? WmsorderTypeDirectionCode { get; set; }

    public bool WmsorderTypeIsBonded { get; set; }

    public bool WmsorderTypeIsActive { get; set; }

    public int WmsorderTypeSortOrder { get; set; }

    public virtual ICollection<WmsOrder> WmsOrders { get; set; } = new List<WmsOrder>();
}
