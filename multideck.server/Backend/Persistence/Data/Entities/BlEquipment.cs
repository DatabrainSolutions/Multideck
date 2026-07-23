using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlEquipment
{
    public Guid BleId { get; set; }

    public Guid BleBlId { get; set; }

    public Guid? BleJobContainerId { get; set; }

    public int BleSequence { get; set; }

    public string BleEquipmentNumber { get; set; } = null!;

    public Guid? BleEquipmentTypeId { get; set; }

    public string? BleEquipmentTypeCodeSnapshot { get; set; }

    public string? BleEquipmentTypeNameSnapshot { get; set; }

    public string? BleSizeTypeSnapshot { get; set; }

    public decimal? BleTareWeight { get; set; }

    public string? BleTareWeightUom { get; set; }

    public decimal? BleGrossWeight { get; set; }

    public string? BleGrossWeightUom { get; set; }

    public decimal? BleVgmweight { get; set; }

    public string? BleVgmweightUom { get; set; }

    public decimal? BleTemperatureMin { get; set; }

    public decimal? BleTemperatureMax { get; set; }

    public string? BleTemperatureUom { get; set; }

    public string BleRawSnapshot { get; set; } = null!;

    public virtual ICollection<BlEquipmentSeal> BlEquipmentSeals { get; set; } = new List<BlEquipmentSeal>();

    public virtual ICollection<BlGoodsEquipment> BlGoodsEquipments { get; set; } = new List<BlGoodsEquipment>();

    public virtual ICollection<BlHandlingInstruction> BlHandlingInstructions { get; set; } = new List<BlHandlingInstruction>();

    public virtual BlHeader BleBl { get; set; } = null!;

    public virtual JobContainer? BleJobContainer { get; set; }
}
