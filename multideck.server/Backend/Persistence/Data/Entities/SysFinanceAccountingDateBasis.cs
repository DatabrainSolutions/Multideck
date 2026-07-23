using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceAccountingDateBasis
{
    public string FinadbCode { get; set; } = null!;

    public string FinadbName { get; set; } = null!;

    public string? FinadbDescription { get; set; }

    public int FinadbSortOrder { get; set; }

    public bool FinadbIsActive { get; set; }

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAccountingDateRule> FinAccountingDateRuleFinacctDateRuleBasisCodeNavigations { get; set; } = new List<FinAccountingDateRule>();

    public virtual ICollection<FinAccountingDateRule> FinAccountingDateRuleFinacctDateRuleFallbackBasisCodeNavigations { get; set; } = new List<FinAccountingDateRule>();
}
