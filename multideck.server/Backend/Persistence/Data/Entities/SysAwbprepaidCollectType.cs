using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Prepaid/collect classification for AWB charge declarations and charge lines.
/// </summary>
public partial class SysAwbprepaidCollectType
{
    public string AwbpcCode { get; set; } = null!;

    public string AwbpcName { get; set; } = null!;

    public string? AwbpcDescription { get; set; }

    public int AwbpcSortOrder { get; set; }

    public bool AwbpcIsActive { get; set; }

    public DateTime AwbpcCreatedAt { get; set; }

    public virtual ICollection<AwbCharge> AwbCharges { get; set; } = new List<AwbCharge>();

    public virtual ICollection<AwbHeader> AwbHeaderAwbChargeDeclarationPrepaidCollectNavigations { get; set; } = new List<AwbHeader>();

    public virtual ICollection<AwbHeader> AwbHeaderAwbOtherChargesPrepaidCollectNavigations { get; set; } = new List<AwbHeader>();

    public virtual ICollection<AwbHeader> AwbHeaderAwbWeightChargePrepaidCollectNavigations { get; set; } = new List<AwbHeader>();
}
