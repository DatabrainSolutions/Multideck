using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWarehouseLocationType
{
    public int Id { get; set; }

    public DateTime CreatedAt { get; set; }

    public Guid? CreatedBy { get; set; }

    public string? WhltDesc { get; set; }
}
