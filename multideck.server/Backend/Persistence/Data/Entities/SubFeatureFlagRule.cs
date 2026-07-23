using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubFeatureFlagRule
{
    public Guid SubfeatureRuleId { get; set; }

    public Guid SubfeatureRuleFeatureId { get; set; }

    public Guid? SubfeatureRuleOrgOfficeId { get; set; }

    public Guid? SubfeatureRuleUserId { get; set; }

    public Guid? SubfeatureRuleLegalEntityId { get; set; }

    public Guid? SubfeatureRuleBrandId { get; set; }

    public bool SubfeatureRuleIsEnabled { get; set; }

    public string SubfeatureRuleConditionsJson { get; set; } = null!;

    public DateTime SubfeatureRuleEffectiveFrom { get; set; }

    public DateTime? SubfeatureRuleEffectiveTo { get; set; }

    public DateTime SubfeatureRuleCreatedAt { get; set; }

    public virtual CmpBrand? SubfeatureRuleBrand { get; set; }

    public virtual SubFeatureFlag SubfeatureRuleFeature { get; set; } = null!;

    public virtual CmpLegalEntity? SubfeatureRuleLegalEntity { get; set; }

    public virtual CmpOffice? SubfeatureRuleOrgOffice { get; set; }

    public virtual CmpUser? SubfeatureRuleUser { get; set; }
}
