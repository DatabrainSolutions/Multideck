using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsAdjustmentLine
{
    public Guid WmsadjustLineId { get; set; }

    public Guid WmsadjustLineAdjustmentId { get; set; }

    public Guid? WmsadjustLineBalanceId { get; set; }

    public Guid WmsadjustLineItemId { get; set; }

    public int WmsadjustLineLineNo { get; set; }

    public decimal WmsadjustLinePreviousQuantity { get; set; }

    public decimal WmsadjustLineNewQuantity { get; set; }

    public decimal WmsadjustLineAdjustmentQuantity { get; set; }

    public string WmsadjustLineUomcode { get; set; } = null!;

    public Guid? WmsadjustLineInventoryTransactionId { get; set; }

    public string? WmsadjustLineNotes { get; set; }

    public virtual WmsAdjustment WmsadjustLineAdjustment { get; set; } = null!;

    public virtual WmsInventoryBalance? WmsadjustLineBalance { get; set; }

    public virtual WmsInventoryTransaction? WmsadjustLineInventoryTransaction { get; set; }

    public virtual WmsItem WmsadjustLineItem { get; set; } = null!;
}
