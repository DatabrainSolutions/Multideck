using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommRuleActionType
{
    public string CommRuleActionTypeCode { get; set; } = null!;

    public string CommRuleActionTypeName { get; set; } = null!;

    public string? CommRuleActionTypeDescription { get; set; }

    public int CommRuleActionTypeSortOrder { get; set; }

    public bool CommRuleActionTypeIsActive { get; set; }

    public DateTime CommRuleActionTypeCreatedAt { get; set; }

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();
}
