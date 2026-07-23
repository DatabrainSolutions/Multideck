using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedRemovalLine
{
    public Guid WmsbondRemovalLineId { get; set; }

    public Guid WmsbondRemovalLineRemovalId { get; set; }

    public Guid? WmsbondRemovalLineEntryLineId { get; set; }

    public Guid? WmsbondRemovalLineBalanceId { get; set; }

    public Guid? WmsbondRemovalLineOrderLineId { get; set; }

    public Guid WmsbondRemovalLineItemId { get; set; }

    public int WmsbondRemovalLineLineNo { get; set; }

    public decimal WmsbondRemovalLineQuantity { get; set; }

    public string WmsbondRemovalLineUomcode { get; set; } = null!;

    public decimal WmsbondRemovalLineCustomsValue { get; set; }

    public decimal WmsbondRemovalLineDutyDueAmount { get; set; }

    public decimal WmsbondRemovalLineTaxDueAmount { get; set; }

    public string WmsbondRemovalLineStatusCode { get; set; } = null!;

    public virtual WmsInventoryBalance? WmsbondRemovalLineBalance { get; set; }

    public virtual WmsBondedEntryLine? WmsbondRemovalLineEntryLine { get; set; }

    public virtual WmsItem WmsbondRemovalLineItem { get; set; } = null!;

    public virtual WmsOrderLine? WmsbondRemovalLineOrderLine { get; set; }

    public virtual WmsBondedRemoval WmsbondRemovalLineRemoval { get; set; } = null!;
}
