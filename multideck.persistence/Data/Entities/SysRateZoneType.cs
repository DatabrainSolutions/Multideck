using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateZoneType
{
    public string RatezoneCode { get; set; } = null!;

    public string RatezoneName { get; set; } = null!;

    public string? RatezoneDescription { get; set; }

    public int RatezoneSortOrder { get; set; }

    public virtual ICollection<RateZoneGroup> RateZoneGroups { get; set; } = new List<RateZoneGroup>();

    public virtual ICollection<RateZoneMember> RateZoneMembers { get; set; } = new List<RateZoneMember>();
}
