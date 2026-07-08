using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceAccountingDateRuleScope
{
    public string FinadrsCode { get; set; } = null!;

    public string FinadrsName { get; set; } = null!;

    public string? FinadrsDescription { get; set; }

    public int FinadrsSortOrder { get; set; }

    public bool FinadrsIsActive { get; set; }

    public virtual ICollection<FinAccountingDateRuleCondition> FinAccountingDateRuleConditions { get; set; } = new List<FinAccountingDateRuleCondition>();
}
