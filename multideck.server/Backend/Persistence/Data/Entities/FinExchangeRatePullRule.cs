using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinExchangeRatePullRule
{
    public Guid FinrateRuleId { get; set; }

    public string FinrateRuleCode { get; set; } = null!;

    public string FinrateRuleName { get; set; } = null!;

    public string FinrateRuleUsageTypeCode { get; set; } = null!;

    public string? FinrateRuleFromCurrencyCode { get; set; }

    public string? FinrateRuleToCurrencyCode { get; set; }

    public string FinrateRuleBaseRateTypeCode { get; set; } = null!;

    public string FinrateRuleAdjustmentMethodCode { get; set; } = null!;

    public decimal FinrateRuleAdjustmentAmount { get; set; }

    public decimal FinrateRuleAdjustmentPercent { get; set; }

    public decimal FinrateRuleMinimumSpread { get; set; }

    public int FinrateRuleRoundingPrecision { get; set; }

    public int FinrateRulePriority { get; set; }

    public bool FinrateRuleIsActive { get; set; }

    public DateOnly FinrateRuleEffectiveFrom { get; set; }

    public DateOnly? FinrateRuleEffectiveTo { get; set; }

    public DateTime FinrateRuleCreatedAt { get; set; }

    public virtual SysFinanceRoeadjustmentMethod FinrateRuleAdjustmentMethodCodeNavigation { get; set; } = null!;

    public virtual SysFinanceRoetype FinrateRuleBaseRateTypeCodeNavigation { get; set; } = null!;

    public virtual SysFinanceRoeusageType FinrateRuleUsageTypeCodeNavigation { get; set; } = null!;
}
