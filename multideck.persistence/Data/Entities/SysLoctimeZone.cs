using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLoctimeZone
{
    public string LoctzCode { get; set; } = null!;

    public string LoctzName { get; set; } = null!;

    public string? LoctzRegion { get; set; }

    public string? LoctzCurrentAbbreviation { get; set; }

    public TimeSpan? LoctzCurrentUtcoffset { get; set; }

    public bool? LoctzCurrentIsDst { get; set; }

    public bool LoctzIsActive { get; set; }

    public bool LoctzIsSystem { get; set; }

    public DateTime LoctzUpdatedAt { get; set; }

    public virtual ICollection<LocLocalisationProfile> LocLocalisationProfiles { get; set; } = new List<LocLocalisationProfile>();

    public virtual ICollection<LocRecordDateTimeContext> LocRecordDateTimeContexts { get; set; } = new List<LocRecordDateTimeContext>();

    public virtual ICollection<LocUserPreference> LocUserPreferences { get; set; } = new List<LocUserPreference>();

    public virtual ICollection<SysLoctimeZoneAlias> SysLoctimeZoneAliases { get; set; } = new List<SysLoctimeZoneAlias>();
}
