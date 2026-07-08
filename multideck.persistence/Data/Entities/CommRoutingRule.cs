using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommRoutingRule
{
    public Guid CommRuleId { get; set; }

    public string CommRuleCode { get; set; } = null!;

    public string CommRuleName { get; set; } = null!;

    public string? CommRuleDescription { get; set; }

    public string? CommRuleChannelCode { get; set; }

    public Guid? CommRuleMailboxId { get; set; }

    public Guid? CommRuleOrgOfficeId { get; set; }

    public Guid? CommRuleLegalEntityId { get; set; }

    public Guid? CommRuleBrandId { get; set; }

    public string CommRuleActionTypeCode { get; set; } = null!;

    public Guid? CommRuleAssignUserId { get; set; }

    public Guid? CommRuleAssignGroupId { get; set; }

    public string? CommRulePriorityCode { get; set; }

    public string CommRuleConditionJson { get; set; } = null!;

    public string CommRuleActionJson { get; set; } = null!;

    public int CommRuleSortOrder { get; set; }

    public bool CommRuleIsActive { get; set; }

    public DateTime CommRuleCreatedAt { get; set; }

    public Guid? CommRuleCreatedBy { get; set; }

    public DateTime CommRuleUpdatedAt { get; set; }

    public Guid? CommRuleUpdatedBy { get; set; }

    public virtual SysCommRuleActionType CommRuleActionTypeCodeNavigation { get; set; } = null!;

    public virtual CmpGroup? CommRuleAssignGroup { get; set; }

    public virtual CmpUser? CommRuleAssignUser { get; set; }

    public virtual CmpBrand? CommRuleBrand { get; set; }

    public virtual SysCommChannel? CommRuleChannelCodeNavigation { get; set; }

    public virtual CmpUser? CommRuleCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? CommRuleLegalEntity { get; set; }

    public virtual CommMailbox? CommRuleMailbox { get; set; }

    public virtual CmpOffice? CommRuleOrgOffice { get; set; }

    public virtual SysCommPriority? CommRulePriorityCodeNavigation { get; set; }

    public virtual CmpUser? CommRuleUpdatedByNavigation { get; set; }
}
