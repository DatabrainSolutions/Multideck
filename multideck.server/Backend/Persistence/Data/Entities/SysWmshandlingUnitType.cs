using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmshandlingUnitType
{
    public string WmshutypeCode { get; set; } = null!;

    public string WmshutypeName { get; set; } = null!;

    public string? WmshutypeDescription { get; set; }

    public bool WmshutypeIsContainer { get; set; }

    public bool WmshutypeIsActive { get; set; }

    public int WmshutypeSortOrder { get; set; }

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();
}
