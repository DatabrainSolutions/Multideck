using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedEntryLine
{
    public Guid WmsbondEntryLineId { get; set; }

    public Guid WmsbondEntryLineEntryId { get; set; }

    public Guid? WmsbondEntryLineOrderLineId { get; set; }

    public Guid WmsbondEntryLineItemId { get; set; }

    public int WmsbondEntryLineLineNo { get; set; }

    public string? WmsbondEntryLineHscode { get; set; }

    public string? WmsbondEntryLineGoodsDescription { get; set; }

    public string? WmsbondEntryLineCountryOfOriginCode { get; set; }

    public decimal WmsbondEntryLineQuantity { get; set; }

    public string WmsbondEntryLineUomcode { get; set; } = null!;

    public decimal? WmsbondEntryLineGrossWeightKg { get; set; }

    public decimal? WmsbondEntryLineNetWeightKg { get; set; }

    public decimal WmsbondEntryLineCustomsValue { get; set; }

    public decimal WmsbondEntryLineDutyEstimate { get; set; }

    public decimal WmsbondEntryLineTaxEstimate { get; set; }

    public string? WmsbondEntryLineLicenseReference { get; set; }

    public string WmsbondEntryLineRestrictionFlagsJson { get; set; } = null!;

    public decimal WmsbondEntryLineRemainingQuantity { get; set; }

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsBondedInventoryLink> WmsBondedInventoryLinks { get; set; } = new List<WmsBondedInventoryLink>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedRemovalLine> WmsBondedRemovalLines { get; set; } = new List<WmsBondedRemovalLine>();

    public virtual WmsBondedEntry WmsbondEntryLineEntry { get; set; } = null!;

    public virtual WmsItem WmsbondEntryLineItem { get; set; } = null!;

    public virtual WmsOrderLine? WmsbondEntryLineOrderLine { get; set; }
}
