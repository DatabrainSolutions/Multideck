using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocpaperSize
{
    public string LocpaperSizeCode { get; set; } = null!;

    public string LocpaperSizeName { get; set; } = null!;

    public decimal? LocpaperSizeWidthMm { get; set; }

    public decimal? LocpaperSizeHeightMm { get; set; }

    public bool LocpaperSizeIsActive { get; set; }

    public int LocpaperSizeSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
