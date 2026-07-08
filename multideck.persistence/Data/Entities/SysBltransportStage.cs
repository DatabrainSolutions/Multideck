using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBltransportStage
{
    public string BltsCode { get; set; } = null!;

    public string BltsName { get; set; } = null!;

    public string? BltsDescription { get; set; }

    public int BltsSortOrder { get; set; }

    public virtual ICollection<BlTransportMovement> BlTransportMovements { get; set; } = new List<BlTransportMovement>();
}
