using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInboundAdviceLine
{
    public Guid WmsadviceLineId { get; set; }

    public Guid WmsadviceLineAdviceId { get; set; }

    public Guid? WmsadviceLineOrderLineId { get; set; }

    public int WmsadviceLineLineNo { get; set; }

    public Guid WmsadviceLineItemId { get; set; }

    public decimal WmsadviceLineExpectedQuantity { get; set; }

    public string WmsadviceLineUomcode { get; set; } = null!;

    public string? WmsadviceLineLotNumber { get; set; }

    public DateOnly? WmsadviceLineExpiryDate { get; set; }

    public string WmsadviceLineCustomsStatusCode { get; set; } = null!;

    public virtual WmsInboundAdvice WmsadviceLineAdvice { get; set; } = null!;

    public virtual SysWmscustomsStatus WmsadviceLineCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual WmsItem WmsadviceLineItem { get; set; } = null!;

    public virtual WmsOrderLine? WmsadviceLineOrderLine { get; set; }
}
