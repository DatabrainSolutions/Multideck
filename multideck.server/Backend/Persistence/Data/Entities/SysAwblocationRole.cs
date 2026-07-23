using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Location roles for AWB origin, destination, routing, transhipment, and execution places.
/// </summary>
public partial class SysAwblocationRole
{
    public string AwblrCode { get; set; } = null!;

    public string AwblrName { get; set; } = null!;

    public string? AwblrDescription { get; set; }

    public bool AwblrIsAirport { get; set; }

    public int AwblrSortOrder { get; set; }

    public bool AwblrIsActive { get; set; }

    public DateTime AwblrCreatedAt { get; set; }

    public virtual ICollection<AwbLocation> AwbLocations { get; set; } = new List<AwbLocation>();
}
