using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateMarginRule
{
    public Guid RatemarginRuleId { get; set; }

    public Guid RatemarginRuleProfileId { get; set; }

    public Guid? RatemarginRuleChargeId { get; set; }

    public string? RatemarginRuleChargeCategoryCode { get; set; }

    public decimal? RatemarginRuleMarkupPercent { get; set; }

    public decimal? RatemarginRuleMarkupAmount { get; set; }

    public decimal? RatemarginRuleMinimumMarginAmount { get; set; }

    public decimal? RatemarginRuleMaximumMarginAmount { get; set; }

    public decimal? RatemarginRuleRoundingIncrement { get; set; }

    public Guid? RatemarginRuleCurrencyId { get; set; }

    public string? RatemarginRuleCurrencyCodeSnapshot { get; set; }

    public string RatemarginRuleRuleJson { get; set; } = null!;

    public int RatemarginRuleSortOrder { get; set; }

    public bool RatemarginRuleIsActive { get; set; }

    public virtual ICollection<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; } = new List<CusQuoteChargesOut>();

    public virtual RateChargeCode? RatemarginRuleCharge { get; set; }

    public virtual SysRateChargeCategory? RatemarginRuleChargeCategoryCodeNavigation { get; set; }

    public virtual SysCurrency? RatemarginRuleCurrency { get; set; }

    public virtual RateMarginProfile RatemarginRuleProfile { get; set; } = null!;
}
