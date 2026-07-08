using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Routing leg classifications for carrier movements shown on an AWB.
/// </summary>
public partial class SysAwbroutingLegType
{
    public string AwbrltCode { get; set; } = null!;

    public string AwbrltName { get; set; } = null!;

    public string? AwbrltDescription { get; set; }

    public int AwbrltSortOrder { get; set; }

    public bool AwbrltIsActive { get; set; }

    public DateTime AwbrltCreatedAt { get; set; }

    public virtual ICollection<AwbRoutingLeg> AwbRoutingLegs { get; set; } = new List<AwbRoutingLeg>();
}
