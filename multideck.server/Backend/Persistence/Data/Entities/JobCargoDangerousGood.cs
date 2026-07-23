using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobCargoDangerousGood
{
    public Guid JobCargoDgId { get; set; }

    public Guid JobCargoDgJobCargoId { get; set; }

    public string? JobCargoDgUnnumber { get; set; }

    public string? JobCargoDgProperShippingName { get; set; }

    public string? JobCargoDgClass { get; set; }

    public string? JobCargoDgPackingGroup { get; set; }

    public string? JobCargoDgFlashPoint { get; set; }

    public bool JobCargoDgMarinePollutant { get; set; }

    public bool JobCargoDgLimitedQuantity { get; set; }

    public string? JobCargoDgEmergencyContact { get; set; }

    public string? JobCargoDgNotes { get; set; }

    public DateTime JobCargoDgCreatedAt { get; set; }

    public virtual JobCargo JobCargoDgJobCargo { get; set; } = null!;
}
