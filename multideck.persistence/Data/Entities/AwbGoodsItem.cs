using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Goods lines for AWB pieces, weights, descriptions, commodity data, and hazardous/perishable indicators.
/// </summary>
public partial class AwbGoodsItem
{
    public Guid AwbgId { get; set; }

    public Guid AwbgAwbid { get; set; }

    public int AwbgLineNumber { get; set; }

    public int AwbgPieceCount { get; set; }

    public int? AwbgSlacquantity { get; set; }

    public Guid? AwbgPackageTypeId { get; set; }

    public string? AwbgPackageTypeCodeSnapshot { get; set; }

    public string AwbgNatureAndQuantityOfGoods { get; set; } = null!;

    public string? AwbgCommodityItemNumber { get; set; }

    public string? AwbgHscode { get; set; }

    public Guid? AwbgCountryOfOriginId { get; set; }

    public string? AwbgCountryOfOriginCodeSnapshot { get; set; }

    public decimal? AwbgGrossWeight { get; set; }

    public string AwbgGrossWeightUom { get; set; } = null!;

    public decimal? AwbgChargeableWeight { get; set; }

    public string AwbgChargeableWeightUom { get; set; } = null!;

    public decimal? AwbgVolume { get; set; }

    public string? AwbgVolumeUom { get; set; }

    public string? AwbgDimensionText { get; set; }

    public bool AwbgIsDangerousGoods { get; set; }

    public bool? AwbgIsStackable { get; set; }

    public decimal? AwbgTemperatureMinimum { get; set; }

    public decimal? AwbgTemperatureMaximum { get; set; }

    public string? AwbgTemperatureUom { get; set; }

    public string? AwbgMarksAndNumbers { get; set; }

    public string? AwbgNotes { get; set; }

    public DateTime AwbgCreatedAt { get; set; }

    public Guid? AwbgJobCargoId { get; set; }

    public virtual ICollection<AwbCustomsInformation> AwbCustomsInformations { get; set; } = new List<AwbCustomsInformation>();

    public virtual ICollection<AwbDangerousGood> AwbDangerousGoods { get; set; } = new List<AwbDangerousGood>();

    public virtual ICollection<AwbDimension> AwbDimensions { get; set; } = new List<AwbDimension>();

    public virtual ICollection<AwbRateLine> AwbRateLines { get; set; } = new List<AwbRateLine>();

    public virtual ICollection<AwbSecurityScreening> AwbSecurityScreenings { get; set; } = new List<AwbSecurityScreening>();

    public virtual ICollection<AwbSpecialHandling> AwbSpecialHandlings { get; set; } = new List<AwbSpecialHandling>();

    public virtual AwbHeader AwbgAwb { get; set; } = null!;

    public virtual JobCargo? AwbgJobCargo { get; set; }
}
