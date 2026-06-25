using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WarehouseLocation
{
    public Guid WhlId { get; set; }

    public Guid WhlAreaId { get; set; }

    public int? WhlType { get; set; }

    public int? WhlHeight { get; set; }

    public int? WhlWidth { get; set; }

    public int? WhlDepth { get; set; }

    public int? WhlMaxKilos { get; set; }

    public bool WhlEnabled { get; set; }

    public bool? WhlMultiProduct { get; set; }
}
