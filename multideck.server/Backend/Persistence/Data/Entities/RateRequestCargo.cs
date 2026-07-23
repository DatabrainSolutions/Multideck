using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRequestCargo
{
    public Guid RatereqCargoId { get; set; }

    public Guid RatereqCargoRequestId { get; set; }

    public int RatereqCargoLineNo { get; set; }

    public int? RatereqCargoPieces { get; set; }

    public string? RatereqCargoPackageType { get; set; }

    public decimal? RatereqCargoGrossWeight { get; set; }

    public string RatereqCargoGrossWeightUom { get; set; } = null!;

    public decimal? RatereqCargoVolume { get; set; }

    public string RatereqCargoVolumeUom { get; set; } = null!;

    public decimal? RatereqCargoChargeableWeight { get; set; }

    public string RatereqCargoChargeableWeightUom { get; set; } = null!;

    public decimal? RatereqCargoLength { get; set; }

    public decimal? RatereqCargoWidth { get; set; }

    public decimal? RatereqCargoHeight { get; set; }

    public string? RatereqCargoDimensionUom { get; set; }

    public string? RatereqCargoCommodityCode { get; set; }

    public string? RatereqCargoHscode { get; set; }

    public bool? RatereqCargoStackable { get; set; }

    public bool RatereqCargoDangerousGoods { get; set; }

    public bool RatereqCargoTemperatureControlled { get; set; }

    public string RatereqCargoMetadataJson { get; set; } = null!;

    public virtual RateRateRequest RatereqCargoRequest { get; set; } = null!;
}
