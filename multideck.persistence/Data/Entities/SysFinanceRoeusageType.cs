using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceRoeusageType
{
    public string FinroeuCode { get; set; } = null!;

    public string FinroeuName { get; set; } = null!;

    public string? FinroeuDescription { get; set; }

    public int FinroeuSortOrder { get; set; }

    public bool FinroeuIsActive { get; set; }

    public virtual ICollection<FinExchangeRatePullRule> FinExchangeRatePullRules { get; set; } = new List<FinExchangeRatePullRule>();

    public virtual ICollection<FinJobRoeset> FinJobRoesets { get; set; } = new List<FinJobRoeset>();
}
