using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceAllocationStatus
{
    public string FinallocstCode { get; set; } = null!;

    public string FinallocstName { get; set; } = null!;

    public string? FinallocstDescription { get; set; }

    public bool FinallocstIsFinal { get; set; }

    public int FinallocstSortOrder { get; set; }

    public bool FinallocstIsActive { get; set; }

    public virtual ICollection<FinCashAllocation> FinCashAllocations { get; set; } = new List<FinCashAllocation>();

    public virtual ICollection<FinJobChargeAllocation> FinJobChargeAllocations { get; set; } = new List<FinJobChargeAllocation>();
}
