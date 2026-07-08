using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinComplianceRule
{
    public Guid FincompRuleId { get; set; }

    public string FincompRuleCode { get; set; } = null!;

    public string FincompRuleName { get; set; } = null!;

    public Guid? FincompRuleJurisdictionId { get; set; }

    public string FincompRuleRuleTypeCode { get; set; } = null!;

    public string FincompRuleRuleJson { get; set; } = null!;

    public bool FincompRuleIsActive { get; set; }

    public virtual FinTaxJurisdiction? FincompRuleJurisdiction { get; set; }
}
