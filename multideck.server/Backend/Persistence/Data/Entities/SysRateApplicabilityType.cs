using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateApplicabilityType
{
    public string RateappCode { get; set; } = null!;

    public string RateappName { get; set; } = null!;

    public string? RateappDescription { get; set; }

    public int RateappSortOrder { get; set; }

    public virtual ICollection<RateChargeCode> RateChargeCodes { get; set; } = new List<RateChargeCode>();

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual ICollection<RateRateSheet> RateRateSheets { get; set; } = new List<RateRateSheet>();
}
