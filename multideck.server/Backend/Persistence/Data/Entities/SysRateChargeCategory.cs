using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateChargeCategory
{
    public string RateccatCode { get; set; } = null!;

    public string RateccatName { get; set; } = null!;

    public string? RateccatDescription { get; set; }

    public bool RateccatIsFreight { get; set; }

    public bool RateccatIsSurcharge { get; set; }

    public int RateccatSortOrder { get; set; }

    public virtual ICollection<RateChargeCode> RateChargeCodes { get; set; } = new List<RateChargeCode>();

    public virtual ICollection<RateMarginRule> RateMarginRules { get; set; } = new List<RateMarginRule>();
}
