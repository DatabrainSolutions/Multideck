using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocdisplayTimeZoneMode
{
    public string LocdisplayTzmodeCode { get; set; } = null!;

    public string LocdisplayTzmodeName { get; set; } = null!;

    public string? LocdisplayTzmodeDescription { get; set; }

    public bool LocdisplayTzmodeShowSecondaryByDefault { get; set; }

    public bool LocdisplayTzmodeIsActive { get; set; }

    public int LocdisplayTzmodeSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
