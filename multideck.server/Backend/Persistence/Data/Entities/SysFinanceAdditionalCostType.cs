using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceAdditionalCostType
{
    public string FinactCode { get; set; } = null!;

    public string FinactName { get; set; } = null!;

    public string? FinactDescription { get; set; }

    public int FinactSortOrder { get; set; }

    public bool FinactIsActive { get; set; }

    public virtual ICollection<FinAdditionalCostRisk> FinAdditionalCostRisks { get; set; } = new List<FinAdditionalCostRisk>();
}
