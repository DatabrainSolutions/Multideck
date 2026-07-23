using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB charge line classifications including weight, valuation, tax, due agent, and due carrier charges.
/// </summary>
public partial class SysAwbchargeType
{
    public string AwbctCode { get; set; } = null!;

    public string AwbctName { get; set; } = null!;

    public string? AwbctDescription { get; set; }

    public string? AwbctDefaultDueTo { get; set; }

    public int AwbctSortOrder { get; set; }

    public bool AwbctIsActive { get; set; }

    public DateTime AwbctCreatedAt { get; set; }

    public virtual ICollection<AwbCharge> AwbCharges { get; set; } = new List<AwbCharge>();
}
