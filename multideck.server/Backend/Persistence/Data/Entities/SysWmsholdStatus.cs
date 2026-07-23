using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsholdStatus
{
    public string WmsholdStatusCode { get; set; } = null!;

    public string WmsholdStatusName { get; set; } = null!;

    public string? WmsholdStatusDescription { get; set; }

    public bool WmsholdStatusIsOpen { get; set; }

    public bool WmsholdStatusIsBlocking { get; set; }

    public bool WmsholdStatusIsActive { get; set; }

    public int WmsholdStatusSortOrder { get; set; }

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();
}
