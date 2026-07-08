using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlEquipmentSeal
{
    public Guid BlesId { get; set; }

    public Guid BlesBleId { get; set; }

    public string BlesSealNumber { get; set; } = null!;

    public string? BlesSealType { get; set; }

    public string? BlesIssuingParty { get; set; }

    public virtual BlEquipment BlesBle { get; set; } = null!;
}
