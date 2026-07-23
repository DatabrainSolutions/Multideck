using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocweekStartDay
{
    public string LocweekStartCode { get; set; } = null!;

    public string LocweekStartName { get; set; } = null!;

    public int LocweekStartIsodayNumber { get; set; }

    public bool LocweekStartIsActive { get; set; }

    public int LocweekStartSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
