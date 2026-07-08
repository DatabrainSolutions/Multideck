using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateContractType
{
    public string RatectCode { get; set; } = null!;

    public string RatectName { get; set; } = null!;

    public string? RatectDescription { get; set; }

    public bool RatectIsBuySide { get; set; }

    public bool RatectIsSellSide { get; set; }

    public int RatectSortOrder { get; set; }

    public virtual ICollection<RateContract> RateContracts { get; set; } = new List<RateContract>();
}
