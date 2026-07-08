using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlGoodsItem
{
    public Guid BlgId { get; set; }

    public Guid BlgBlId { get; set; }

    public Guid? BlgJobCargoId { get; set; }

    public int BlgLineNo { get; set; }

    public string? BlgMarksAndNumbers { get; set; }

    public decimal? BlgPackageQuantity { get; set; }

    public Guid? BlgPackageTypeId { get; set; }

    public string? BlgPackageTypeCodeSnapshot { get; set; }

    public string? BlgPackageTypeNameSnapshot { get; set; }

    public Guid? BlgGoodsTypeCodeId { get; set; }

    public string? BlgGoodsTypeCodeSnapshot { get; set; }

    public string BlgDescription { get; set; } = null!;

    public string? BlgHscode { get; set; }

    public Guid? BlgCountryOfOriginId { get; set; }

    public string? BlgCountryOfOriginCodeSnapshot { get; set; }

    public decimal? BlgGrossWeight { get; set; }

    public string BlgGrossWeightUom { get; set; } = null!;

    public decimal? BlgNetWeight { get; set; }

    public string? BlgNetWeightUom { get; set; }

    public decimal? BlgVolume { get; set; }

    public string? BlgVolumeUom { get; set; }

    public decimal? BlgDeclaredValueAmount { get; set; }

    public Guid? BlgDeclaredValueCurrencyId { get; set; }

    public decimal? BlgInsuranceValueAmount { get; set; }

    public Guid? BlgInsuranceValueCurrencyId { get; set; }

    public bool BlgIsDangerousGoods { get; set; }

    public string BlgRawSnapshot { get; set; } = null!;

    public virtual ICollection<BlDangerousGood> BlDangerousGoods { get; set; } = new List<BlDangerousGood>();

    public virtual ICollection<BlGoodsEquipment> BlGoodsEquipments { get; set; } = new List<BlGoodsEquipment>();

    public virtual ICollection<BlHandlingInstruction> BlHandlingInstructions { get; set; } = new List<BlHandlingInstruction>();

    public virtual BlHeader BlgBl { get; set; } = null!;

    public virtual JobCargo? BlgJobCargo { get; set; }
}
