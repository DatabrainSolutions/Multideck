using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB document locations, including airports and non-airport execution or delivery locations.
/// </summary>
public partial class AwbLocation
{
    public Guid AwblId { get; set; }

    public Guid AwblAwbid { get; set; }

    public string AwblRole { get; set; } = null!;

    public Guid? AwblLocationId { get; set; }

    public string? AwblAirportCodeSnapshot { get; set; }

    public string? AwblUnlocodesnapshot { get; set; }

    public string? AwblNameSnapshot { get; set; }

    public string? AwblCitySnapshot { get; set; }

    public Guid? AwblCountryId { get; set; }

    public string? AwblCountryCodeSnapshot { get; set; }

    public DateTime? AwblPlannedDateTime { get; set; }

    public DateTime? AwblActualDateTime { get; set; }

    public int AwblSortOrder { get; set; }

    public string? AwblNotes { get; set; }

    public DateTime AwblCreatedAt { get; set; }

    public virtual AwbHeader AwblAwb { get; set; } = null!;

    public virtual SysAwblocationRole AwblRoleNavigation { get; set; } = null!;
}
