using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmslocationStatus
{
    public string WmslocationStatusCode { get; set; } = null!;

    public string WmslocationStatusName { get; set; } = null!;

    public string? WmslocationStatusDescription { get; set; }

    public bool WmslocationStatusIsUsable { get; set; }

    public bool WmslocationStatusIsActive { get; set; }

    public int WmslocationStatusSortOrder { get; set; }

    public virtual ICollection<WmsDock> WmsDocks { get; set; } = new List<WmsDock>();

    public virtual ICollection<WmsLocation> WmsLocations { get; set; } = new List<WmsLocation>();

    public virtual ICollection<WmsZone> WmsZones { get; set; } = new List<WmsZone>();
}
