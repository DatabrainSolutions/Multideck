using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceFxgainLossType
{
    public string FinfxgltCode { get; set; } = null!;

    public string FinfxgltName { get; set; } = null!;

    public string? FinfxgltDescription { get; set; }

    public int FinfxgltSortOrder { get; set; }

    public bool FinfxgltIsActive { get; set; }

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();
}
