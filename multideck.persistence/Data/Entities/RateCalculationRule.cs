using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateCalculationRule
{
    public Guid RatecalcRuleId { get; set; }

    public Guid RatecalcRuleRuleSetId { get; set; }

    public string RatecalcRuleCode { get; set; } = null!;

    public string RatecalcRuleName { get; set; } = null!;

    public string RatecalcRuleCalculationMethodCode { get; set; } = null!;

    public string? RatecalcRuleBasisCode { get; set; }

    public string? RatecalcRuleFormulaText { get; set; }

    public string RatecalcRuleConfigJson { get; set; } = null!;

    public int RatecalcRuleSortOrder { get; set; }

    public bool RatecalcRuleIsActive { get; set; }

    public DateTime RatecalcRuleCreatedAt { get; set; }

    public virtual SysRateBasisType? RatecalcRuleBasisCodeNavigation { get; set; }

    public virtual SysRateCalculationMethod RatecalcRuleCalculationMethodCodeNavigation { get; set; } = null!;

    public virtual RateRuleSet RatecalcRuleRuleSet { get; set; } = null!;
}
