using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCommissionRule
{
    public Guid FincommRuleId { get; set; }

    public Guid FincommRuleSchemeId { get; set; }

    public string? FincommRuleModeCode { get; set; }

    public Guid? FincommRuleChargeId { get; set; }

    public decimal FincommRuleTierFromAmount { get; set; }

    public decimal? FincommRuleTierToAmount { get; set; }

    public decimal FincommRulePercent { get; set; }

    public decimal FincommRuleFixedAmount { get; set; }

    public bool FincommRulePayOnlyWhenCustomerPaid { get; set; }

    public bool FincommRuleIsActive { get; set; }

    public virtual ICollection<FinCommissionItem> FinCommissionItems { get; set; } = new List<FinCommissionItem>();

    public virtual RateChargeCode? FincommRuleCharge { get; set; }

    public virtual FinCommissionScheme FincommRuleScheme { get; set; } = null!;
}
