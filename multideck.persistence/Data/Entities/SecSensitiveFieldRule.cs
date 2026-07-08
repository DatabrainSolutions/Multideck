using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SecSensitiveFieldRule
{
    public Guid SecsensRuleId { get; set; }

    public Guid SecsensRuleSensitiveFieldId { get; set; }

    public string SecsensRuleActionCode { get; set; } = null!;

    public string SecsensRuleMinSecurityClassCode { get; set; } = null!;

    public bool SecsensRuleRequiresReason { get; set; }

    public bool SecsensRuleRequiresAudit { get; set; }

    public bool SecsensRuleRequiresApproval { get; set; }

    public string? SecsensRuleMaskingPattern { get; set; }

    public string SecsensRuleConditionsJson { get; set; } = null!;

    public bool SecsensRuleIsActive { get; set; }

    public virtual SysSecsensitiveFieldAction SecsensRuleActionCodeNavigation { get; set; } = null!;

    public virtual SysSecsecurityClass SecsensRuleMinSecurityClassCodeNavigation { get; set; } = null!;

    public virtual SecSensitiveField SecsensRuleSensitiveField { get; set; } = null!;
}
