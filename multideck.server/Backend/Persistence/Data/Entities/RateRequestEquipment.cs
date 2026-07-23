using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRequestEquipment
{
    public Guid RatereqEquipId { get; set; }

    public Guid RatereqEquipRequestId { get; set; }

    public int RatereqEquipLineNo { get; set; }

    public string RatereqEquipEquipmentTypeCode { get; set; } = null!;

    public string? RatereqEquipEquipmentTypeNameSnapshot { get; set; }

    public int RatereqEquipQuantity { get; set; }

    public bool? RatereqEquipIsSoc { get; set; }

    public bool? RatereqEquipIsReefer { get; set; }

    public string RatereqEquipMetadataJson { get; set; } = null!;

    public virtual RateRateRequest RatereqEquipRequest { get; set; } = null!;
}
