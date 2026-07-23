using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLoctimeFormat
{
    public string LoctimeFormatCode { get; set; } = null!;

    public string LoctimeFormatName { get; set; } = null!;

    public string LoctimeFormatPattern { get; set; } = null!;

    public string LoctimeFormatExample { get; set; } = null!;

    public bool LoctimeFormatIs24Hour { get; set; }

    public bool LoctimeFormatIsActive { get; set; }

    public int LoctimeFormatSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
