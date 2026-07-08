using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateZoneMember
{
    public Guid RatezoneMemberId { get; set; }

    public Guid RatezoneMemberZoneGroupId { get; set; }

    public string RatezoneMemberZoneTypeCode { get; set; } = null!;

    public string RatezoneMemberCode { get; set; } = null!;

    public string? RatezoneMemberNameSnapshot { get; set; }

    public string? RatezoneMemberCountryCode { get; set; }

    public string? RatezoneMemberPostcodeFrom { get; set; }

    public string? RatezoneMemberPostcodeTo { get; set; }

    public string RatezoneMemberMetadataJson { get; set; } = null!;

    public DateTime RatezoneMemberCreatedAt { get; set; }

    public virtual RateZoneGroup RatezoneMemberZoneGroup { get; set; } = null!;

    public virtual SysRateZoneType RatezoneMemberZoneTypeCodeNavigation { get; set; } = null!;
}
