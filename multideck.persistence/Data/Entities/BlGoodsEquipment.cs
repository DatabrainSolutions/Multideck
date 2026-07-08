using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlGoodsEquipment
{
    public Guid BlgeId { get; set; }

    public Guid BlgeBlgId { get; set; }

    public Guid BlgeBleId { get; set; }

    public decimal? BlgePackageQuantity { get; set; }

    public decimal? BlgeGrossWeight { get; set; }

    public string? BlgeGrossWeightUom { get; set; }

    public decimal? BlgeVolume { get; set; }

    public string? BlgeVolumeUom { get; set; }

    public virtual BlEquipment BlgeBle { get; set; } = null!;

    public virtual BlGoodsItem BlgeBlg { get; set; } = null!;
}
