using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceScreeningTouchpointRule
{
    public Guid TcetouchRuleId { get; set; }

    public Guid TcetouchRulePolicyId { get; set; }

    public string TcetouchRuleTouchpointTypeCode { get; set; } = null!;

    public string TcetouchRuleCheckTypeCode { get; set; } = null!;

    public string TcetouchRuleRunTypeCode { get; set; } = null!;

    public string? TcetouchRuleActionTypeCode { get; set; }

    public string? TcetouchRuleAppliesToSourceTable { get; set; }

    public string? TcetouchRuleRequiredBeforeActionCode { get; set; }

    public bool TcetouchRuleIsAutomatic { get; set; }

    public bool TcetouchRuleCreateChecklistItem { get; set; }

    public bool TcetouchRuleCreateWorkflowTask { get; set; }

    public bool TcetouchRuleBlockOnFailure { get; set; }

    public int? TcetouchRuleSlahours { get; set; }

    public int TcetouchRuleSortOrder { get; set; }

    public bool TcetouchRuleIsActive { get; set; }

    public string TcetouchRuleSettingsJson { get; set; } = null!;

    public DateTime TcetouchRuleCreatedAt { get; set; }

    public Guid? TcetouchRuleCreatedBy { get; set; }

    public virtual SysTceactionType? TcetouchRuleActionTypeCodeNavigation { get; set; }

    public virtual SysTcecheckType TcetouchRuleCheckTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcetouchRuleCreatedByNavigation { get; set; }

    public virtual TceScreeningPolicy TcetouchRulePolicy { get; set; } = null!;

    public virtual SysTcescreeningRunType TcetouchRuleRunTypeCodeNavigation { get; set; } = null!;

    public virtual SysTcetouchpointType TcetouchRuleTouchpointTypeCodeNavigation { get; set; } = null!;
}
