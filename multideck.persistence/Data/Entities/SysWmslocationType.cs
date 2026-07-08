using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmslocationType
{
    public string WmslocationTypeCode { get; set; } = null!;

    public string WmslocationTypeName { get; set; } = null!;

    public string? WmslocationTypeDescription { get; set; }

    public bool WmslocationTypeIsPickable { get; set; }

    public bool WmslocationTypeIsActive { get; set; }

    public int WmslocationTypeSortOrder { get; set; }

    public virtual ICollection<WmsLocation> WmsLocations { get; set; } = new List<WmsLocation>();
}
