using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCashType
{
    public string FincashtCode { get; set; } = null!;

    public string FincashtName { get; set; } = null!;

    public string? FincashtDescription { get; set; }

    public int FincashtSortOrder { get; set; }

    public bool FincashtIsActive { get; set; }

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();
}
