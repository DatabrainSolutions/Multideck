using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceRoeadjustmentMethod
{
    public string FinroeadjCode { get; set; } = null!;

    public string FinroeadjName { get; set; } = null!;

    public string? FinroeadjDescription { get; set; }

    public int FinroeadjSortOrder { get; set; }

    public bool FinroeadjIsActive { get; set; }

    public virtual ICollection<FinExchangeRatePullRule> FinExchangeRatePullRules { get; set; } = new List<FinExchangeRatePullRule>();
}
