using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocmeasurementSystem
{
    public string LocmeasureCode { get; set; } = null!;

    public string LocmeasureName { get; set; } = null!;

    public string LocmeasureWeightUnitCode { get; set; } = null!;

    public string LocmeasureLengthUnitCode { get; set; } = null!;

    public string LocmeasureVolumeUnitCode { get; set; } = null!;

    public string LocmeasureTemperatureUnitCode { get; set; } = null!;

    public bool LocmeasureIsActive { get; set; }

    public int LocmeasureSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
