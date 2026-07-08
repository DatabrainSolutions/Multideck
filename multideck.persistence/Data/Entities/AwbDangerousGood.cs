using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Dangerous goods declarations linked to AWB goods lines. Operational validation should use the current IATA DGR ruleset.
/// </summary>
public partial class AwbDangerousGood
{
    public Guid AwbdgId { get; set; }

    public Guid AwbdgAwbid { get; set; }

    public Guid? AwbdgGoodsItemId { get; set; }

    public string? AwbdgUnnumber { get; set; }

    public string? AwbdgProperShippingName { get; set; }

    public string? AwbdgClassOrDivision { get; set; }

    public string? AwbdgPackingGroup { get; set; }

    public string? AwbdgPackingInstruction { get; set; }

    public string? AwbdgAuthorization { get; set; }

    public string? AwbdgQuantityAndType { get; set; }

    public decimal? AwbdgNetQuantity { get; set; }

    public string? AwbdgNetQuantityUom { get; set; }

    public bool AwbdgCargoAircraftOnly { get; set; }

    public string? AwbdgDgdeclarationReference { get; set; }

    public string? AwbdgEmergencyContactName { get; set; }

    public string? AwbdgEmergencyContactPhone { get; set; }

    public string? AwbdgNotes { get; set; }

    public DateTime AwbdgCreatedAt { get; set; }

    public virtual AwbHeader AwbdgAwb { get; set; } = null!;

    public virtual AwbGoodsItem? AwbdgGoodsItem { get; set; }
}
