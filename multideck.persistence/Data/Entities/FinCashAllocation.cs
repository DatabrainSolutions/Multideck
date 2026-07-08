using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCashAllocation
{
    public Guid FincashAllocId { get; set; }

    public Guid FincashAllocCashId { get; set; }

    public Guid? FincashAllocDocumentId { get; set; }

    public Guid? FincashAllocDocumentLineId { get; set; }

    public string FincashAllocAllocationStatusCode { get; set; } = null!;

    public decimal FincashAllocAllocatedAmount { get; set; }

    public decimal FincashAllocLocalAllocatedAmount { get; set; }

    public decimal FincashAllocCashRate { get; set; }

    public decimal FincashAllocDocumentRate { get; set; }

    public decimal FincashAllocFxgainLossAmount { get; set; }

    public DateTime FincashAllocAllocatedAt { get; set; }

    public Guid? FincashAllocAllocatedBy { get; set; }

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();

    public virtual CmpUser? FincashAllocAllocatedByNavigation { get; set; }

    public virtual SysFinanceAllocationStatus FincashAllocAllocationStatusCodeNavigation { get; set; } = null!;

    public virtual FinCashTransaction FincashAllocCash { get; set; } = null!;

    public virtual FinDocument? FincashAllocDocument { get; set; }

    public virtual FinDocumentLine? FincashAllocDocumentLine { get; set; }
}
