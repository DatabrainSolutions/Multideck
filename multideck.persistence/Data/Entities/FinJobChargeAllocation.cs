using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobChargeAllocation
{
    public Guid FinchargeAllocId { get; set; }

    public Guid FinchargeAllocChargeStateId { get; set; }

    public Guid? FinchargeAllocDocumentId { get; set; }

    public Guid? FinchargeAllocDocumentLineId { get; set; }

    public Guid? FinchargeAllocCashAllocationId { get; set; }

    public string FinchargeAllocAllocationStatusCode { get; set; } = null!;

    public decimal FinchargeAllocAllocatedAmount { get; set; }

    public decimal FinchargeAllocLocalAllocatedAmount { get; set; }

    public DateTime FinchargeAllocAllocatedAt { get; set; }

    public Guid? FinchargeAllocCreatedBy { get; set; }

    public virtual SysFinanceAllocationStatus FinchargeAllocAllocationStatusCodeNavigation { get; set; } = null!;

    public virtual FinJobChargeState FinchargeAllocChargeState { get; set; } = null!;

    public virtual CmpUser? FinchargeAllocCreatedByNavigation { get; set; }

    public virtual FinDocument? FinchargeAllocDocument { get; set; }

    public virtual FinDocumentLine? FinchargeAllocDocumentLine { get; set; }
}
