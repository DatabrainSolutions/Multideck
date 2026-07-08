using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceLedgerType
{
    public string FinltCode { get; set; } = null!;

    public string FinltName { get; set; } = null!;

    public string? FinltDescription { get; set; }

    public int FinltSortOrder { get; set; }

    public bool FinltIsActive { get; set; }

    public virtual ICollection<FinChargeAccountingRule> FinChargeAccountingRules { get; set; } = new List<FinChargeAccountingRule>();

    public virtual ICollection<FinJobChargeState> FinJobChargeStates { get; set; } = new List<FinJobChargeState>();

    public virtual ICollection<FinPeriodLock> FinPeriodLocks { get; set; } = new List<FinPeriodLock>();

    public virtual ICollection<FinPostingRule> FinPostingRules { get; set; } = new List<FinPostingRule>();
}
