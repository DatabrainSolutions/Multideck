using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Party roles used on IATA-aligned AWBs, e-AWBs, MAWBs, and HAWB references.
/// </summary>
public partial class SysAwbpartyRole
{
    public string AwbprCode { get; set; } = null!;

    public string AwbprName { get; set; } = null!;

    public string? AwbprDescription { get; set; }

    public bool AwbprIsRequiredForIssue { get; set; }

    public int AwbprSortOrder { get; set; }

    public bool AwbprIsActive { get; set; }

    public DateTime AwbprCreatedAt { get; set; }

    public virtual ICollection<AwbParty> AwbParties { get; set; } = new List<AwbParty>();
}
