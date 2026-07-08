using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateSpotQuoteLine
{
    public Guid RatespotLineId { get; set; }

    public Guid RatespotLineSpotId { get; set; }

    public int RatespotLineLineNo { get; set; }

    public Guid RatespotLineChargeId { get; set; }

    public string? RatespotLineDescription { get; set; }

    public string RatespotLineBasisCode { get; set; } = null!;

    public Guid? RatespotLineCurrencyId { get; set; }

    public string? RatespotLineCurrencyCodeSnapshot { get; set; }

    public decimal? RatespotLineUnitRate { get; set; }

    public decimal? RatespotLineTotalAmount { get; set; }

    public string RatespotLineRuleJson { get; set; } = null!;

    public virtual ICollection<RateRateResultLine> RateRateResultLines { get; set; } = new List<RateRateResultLine>();

    public virtual SysRateBasisType RatespotLineBasisCodeNavigation { get; set; } = null!;

    public virtual RateChargeCode RatespotLineCharge { get; set; } = null!;

    public virtual SysCurrency? RatespotLineCurrency { get; set; }

    public virtual RateSpotQuote RatespotLineSpot { get; set; } = null!;
}
