using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocdateFormat
{
    public string LocdateFormatCode { get; set; } = null!;

    public string LocdateFormatName { get; set; } = null!;

    public string LocdateFormatPattern { get; set; } = null!;

    public string LocdateFormatExample { get; set; } = null!;

    public bool LocdateFormatIsActive { get; set; }

    public int LocdateFormatSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
