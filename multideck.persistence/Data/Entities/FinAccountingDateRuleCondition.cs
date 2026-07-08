using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingDateRuleCondition
{
    public Guid FinacctDateCondId { get; set; }

    public Guid FinacctDateCondRuleId { get; set; }

    public string FinacctDateCondScopeCode { get; set; } = null!;

    public string FinacctDateCondOperatorCode { get; set; } = null!;

    public string FinacctDateCondValueJson { get; set; } = null!;

    public int FinacctDateCondSortOrder { get; set; }

    public virtual FinAccountingDateRule FinacctDateCondRule { get; set; } = null!;

    public virtual SysFinanceAccountingDateRuleScope FinacctDateCondScopeCodeNavigation { get; set; } = null!;
}
