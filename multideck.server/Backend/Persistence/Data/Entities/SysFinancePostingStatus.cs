using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinancePostingStatus
{
    public string FinpoststCode { get; set; } = null!;

    public string FinpoststName { get; set; } = null!;

    public string? FinpoststDescription { get; set; }

    public bool FinpoststIsFinal { get; set; }

    public int FinpoststSortOrder { get; set; }

    public bool FinpoststIsActive { get; set; }

    public virtual ICollection<FinCashTransaction> FinCashTransactions { get; set; } = new List<FinCashTransaction>();

    public virtual ICollection<FinDocument> FinDocuments { get; set; } = new List<FinDocument>();

    public virtual ICollection<FinPostingBatch> FinPostingBatches { get; set; } = new List<FinPostingBatch>();
}
