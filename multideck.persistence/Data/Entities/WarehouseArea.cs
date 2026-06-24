using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WarehouseArea
{
    public Guid WhaId { get; set; }

    public Guid WhaWarehouse { get; set; }

    public string? WhaName { get; set; }

    public string? WhaDescription { get; set; }

    public bool WhaEnabled { get; set; }

    public int WhaType { get; set; }
}
