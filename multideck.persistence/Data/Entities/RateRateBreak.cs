using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateRateBreak
{
    public Guid RatebreakId { get; set; }

    public Guid RatebreakRateLineId { get; set; }

    public string RatebreakBreakTypeCode { get; set; } = null!;

    public decimal? RatebreakFromQuantity { get; set; }

    public decimal? RatebreakToQuantity { get; set; }

    public decimal? RatebreakUnitRate { get; set; }

    public decimal? RatebreakMinimumAmount { get; set; }

    public decimal? RatebreakMaximumAmount { get; set; }

    public int RatebreakSortOrder { get; set; }

    public string RatebreakMetadataJson { get; set; } = null!;

    public virtual SysRateBreakType RatebreakBreakTypeCodeNavigation { get; set; } = null!;

    public virtual RateRateLine RatebreakRateLine { get; set; } = null!;
}
