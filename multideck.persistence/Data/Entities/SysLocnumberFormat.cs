using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocnumberFormat
{
    public string LocnumberFormatCode { get; set; } = null!;

    public string LocnumberFormatName { get; set; } = null!;

    public string LocnumberFormatDecimalSeparator { get; set; } = null!;

    public string LocnumberFormatThousandsSeparator { get; set; } = null!;

    public string LocnumberFormatNegativePattern { get; set; } = null!;

    public string LocnumberFormatExample { get; set; } = null!;

    public bool LocnumberFormatIsActive { get; set; }

    public int LocnumberFormatSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
