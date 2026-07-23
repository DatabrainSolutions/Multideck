using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Piece-level dimensions used to calculate AWB volume and chargeable weight.
/// </summary>
public partial class AwbDimension
{
    public Guid AwbdimId { get; set; }

    public Guid AwbdimAwbid { get; set; }

    public Guid? AwbdimGoodsItemId { get; set; }

    public int AwbdimLineNumber { get; set; }

    public int AwbdimPieceCount { get; set; }

    public decimal AwbdimLength { get; set; }

    public decimal AwbdimWidth { get; set; }

    public decimal AwbdimHeight { get; set; }

    public string AwbdimDimensionUom { get; set; } = null!;

    public decimal? AwbdimVolume { get; set; }

    public string? AwbdimVolumeUom { get; set; }

    public decimal? AwbdimWeight { get; set; }

    public string? AwbdimWeightUom { get; set; }

    public string? AwbdimNotes { get; set; }

    public DateTime AwbdimCreatedAt { get; set; }

    public virtual AwbHeader AwbdimAwb { get; set; } = null!;

    public virtual AwbGoodsItem? AwbdimGoodsItem { get; set; }
}
