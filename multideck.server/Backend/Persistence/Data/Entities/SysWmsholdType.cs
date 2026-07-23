using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsholdType
{
    public string WmsholdTypeCode { get; set; } = null!;

    public string WmsholdTypeName { get; set; } = null!;

    public string? WmsholdTypeDescription { get; set; }

    public bool WmsholdTypeIsBlocking { get; set; }

    public bool WmsholdTypeIsActive { get; set; }

    public int WmsholdTypeSortOrder { get; set; }

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();
}
