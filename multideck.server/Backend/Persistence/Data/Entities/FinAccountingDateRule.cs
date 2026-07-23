using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccountingDateRule
{
    public Guid FinacctDateRuleId { get; set; }

    public string FinacctDateRuleCode { get; set; } = null!;

    public string FinacctDateRuleName { get; set; } = null!;

    public string FinacctDateRuleStatusCode { get; set; } = null!;

    public int FinacctDateRulePriority { get; set; }

    public string FinacctDateRuleBasisCode { get; set; } = null!;

    public int FinacctDateRuleOffsetDays { get; set; }

    public string? FinacctDateRuleFallbackBasisCode { get; set; }

    public bool FinacctDateRuleAppliesToRevenue { get; set; }

    public bool FinacctDateRuleAppliesToCost { get; set; }

    public bool FinacctDateRuleAppliesToWip { get; set; }

    public bool FinacctDateRuleAppliesToAccrual { get; set; }

    public bool FinacctDateRuleRequiresApprovalForOverride { get; set; }

    public DateOnly FinacctDateRuleEffectiveFrom { get; set; }

    public DateOnly? FinacctDateRuleEffectiveTo { get; set; }

    public DateTime FinacctDateRuleCreatedAt { get; set; }

    public Guid? FinacctDateRuleCreatedBy { get; set; }

    public virtual ICollection<FinAccountingDateEvaluation> FinAccountingDateEvaluations { get; set; } = new List<FinAccountingDateEvaluation>();

    public virtual ICollection<FinAccountingDateRuleCondition> FinAccountingDateRuleConditions { get; set; } = new List<FinAccountingDateRuleCondition>();

    public virtual SysFinanceAccountingDateBasis FinacctDateRuleBasisCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FinacctDateRuleCreatedByNavigation { get; set; }

    public virtual SysFinanceAccountingDateBasis? FinacctDateRuleFallbackBasisCodeNavigation { get; set; }
}
