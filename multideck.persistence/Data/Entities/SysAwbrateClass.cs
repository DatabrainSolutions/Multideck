using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB rating classes for rate lines. Seed list is a starter set and should be reconciled to the licensed IATA source.
/// </summary>
public partial class SysAwbrateClass
{
    public string AwbrcCode { get; set; } = null!;

    public string AwbrcName { get; set; } = null!;

    public string? AwbrcDescription { get; set; }

    public int AwbrcSortOrder { get; set; }

    public bool AwbrcIsActive { get; set; }

    public DateTime AwbrcCreatedAt { get; set; }

    public virtual ICollection<AwbRateLine> AwbRateLines { get; set; } = new List<AwbRateLine>();
}
