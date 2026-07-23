using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceDebtActionType
{
    public string FindebtatCode { get; set; } = null!;

    public string FindebtatName { get; set; } = null!;

    public string? FindebtatDescription { get; set; }

    public int FindebtatSortOrder { get; set; }

    public bool FindebtatIsActive { get; set; }

    public virtual ICollection<FinDebtAction> FinDebtActions { get; set; } = new List<FinDebtAction>();
}
