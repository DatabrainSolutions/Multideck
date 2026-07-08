using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmszoneType
{
    public string WmszoneTypeCode { get; set; } = null!;

    public string WmszoneTypeName { get; set; } = null!;

    public string? WmszoneTypeDescription { get; set; }

    public bool WmszoneTypeAllowsStock { get; set; }

    public bool WmszoneTypeIsActive { get; set; }

    public int WmszoneTypeSortOrder { get; set; }

    public virtual ICollection<WmsZone> WmsZones { get; set; } = new List<WmsZone>();
}
