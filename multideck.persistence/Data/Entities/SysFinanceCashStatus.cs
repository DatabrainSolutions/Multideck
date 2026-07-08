using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCashStatus
{
    public string FincashstCode { get; set; } = null!;

    public string FincashstName { get; set; } = null!;

    public string? FincashstDescription { get; set; }

    public bool FincashstIsFinal { get; set; }

    public int FincashstSortOrder { get; set; }

    public bool FincashstIsActive { get; set; }

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();
}
