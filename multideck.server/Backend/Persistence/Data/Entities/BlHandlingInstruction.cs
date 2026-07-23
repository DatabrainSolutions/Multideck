using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlHandlingInstruction
{
    public Guid BlhId { get; set; }

    public Guid BlhBlId { get; set; }

    public Guid? BlhBlgId { get; set; }

    public Guid? BlhBleId { get; set; }

    public Guid? BlhInstructionTypeId { get; set; }

    public string? BlhInstructionCodeSnapshot { get; set; }

    public string BlhInstructionText { get; set; } = null!;

    public decimal? BlhTemperatureMin { get; set; }

    public decimal? BlhTemperatureMax { get; set; }

    public string? BlhTemperatureUom { get; set; }

    public int BlhSequence { get; set; }

    public virtual BlHeader BlhBl { get; set; } = null!;

    public virtual BlEquipment? BlhBle { get; set; }

    public virtual BlGoodsItem? BlhBlg { get; set; }
}
