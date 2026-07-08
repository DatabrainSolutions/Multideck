using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinProfitShareSettlement
{
    public Guid FinpssettleId { get; set; }

    public Guid FinpssettleItemId { get; set; }

    public Guid? FinpssettleDocumentId { get; set; }

    public string FinpssettleStatusCode { get; set; } = null!;

    public DateTime? FinpssettleSettledAt { get; set; }

    public Guid? FinpssettleSettledBy { get; set; }

    public virtual FinDocument? FinpssettleDocument { get; set; }

    public virtual FinProfitShareItem FinpssettleItem { get; set; } = null!;

    public virtual CmpUser? FinpssettleSettledByNavigation { get; set; }
}
