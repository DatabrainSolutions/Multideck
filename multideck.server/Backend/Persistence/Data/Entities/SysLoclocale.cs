using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLoclocale
{
    public string LoclocaleCode { get; set; } = null!;

    public string LoclocaleName { get; set; } = null!;

    public string LoclocaleLanguageCode { get; set; } = null!;

    public string? LoclocaleCountryCode { get; set; }

    public string? LoclocaleDefaultDateFormatCode { get; set; }

    public string? LoclocaleDefaultTimeFormatCode { get; set; }

    public string? LoclocaleDefaultNumberFormatCode { get; set; }

    public bool LoclocaleIsRtl { get; set; }

    public bool LoclocaleIsActive { get; set; }

    public int LoclocaleSortOrder { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocRecordDateTimeContext> LocRecordDateTimeContexts { get; set; } = new List<LocRecordDateTimeContext>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();
}
