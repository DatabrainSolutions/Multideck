using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsReceiptLine
{
    public Guid WmsreceiptLineId { get; set; }

    public Guid WmsreceiptLineReceiptId { get; set; }

    public Guid? WmsreceiptLineOrderLineId { get; set; }

    public Guid WmsreceiptLineItemId { get; set; }

    public int WmsreceiptLineLineNo { get; set; }

    public decimal WmsreceiptLineExpectedQuantity { get; set; }

    public decimal WmsreceiptLineReceivedQuantity { get; set; }

    public decimal WmsreceiptLineDamagedQuantity { get; set; }

    public decimal WmsreceiptLineOverQuantity { get; set; }

    public decimal WmsreceiptLineShortQuantity { get; set; }

    public string WmsreceiptLineUomcode { get; set; } = null!;

    public string? WmsreceiptLineLotNumber { get; set; }

    public DateOnly? WmsreceiptLineExpiryDate { get; set; }

    public Guid? WmsreceiptLineHuId { get; set; }

    public Guid? WmsreceiptLineTargetLocationId { get; set; }

    public Guid? WmsreceiptLineInventoryTransactionId { get; set; }

    public string WmsreceiptLineCustomsStatusCode { get; set; } = null!;

    public DateTime WmsreceiptLineCreatedAt { get; set; }

    public virtual ICollection<WmsReceiptDiscrepancy> WmsReceiptDiscrepancies { get; set; } = new List<WmsReceiptDiscrepancy>();

    public virtual SysWmscustomsStatus WmsreceiptLineCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsHandlingUnit? WmsreceiptLineHu { get; set; }

    public virtual WmsInventoryTransaction? WmsreceiptLineInventoryTransaction { get; set; }

    public virtual WmsItem WmsreceiptLineItem { get; set; } = null!;

    public virtual WmsOrderLine? WmsreceiptLineOrderLine { get; set; }

    public virtual WmsReceipt WmsreceiptLineReceipt { get; set; } = null!;

    public virtual WmsLocation? WmsreceiptLineTargetLocation { get; set; }
}
