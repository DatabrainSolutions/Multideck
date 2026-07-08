using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubFeatureFlag
{
    public Guid SubfeatureId { get; set; }

    public string SubfeatureCode { get; set; } = null!;

    public string SubfeatureName { get; set; } = null!;

    public string? SubfeatureModuleCode { get; set; }

    public string SubfeatureTypeCode { get; set; } = null!;

    public bool SubfeatureDefaultEnabled { get; set; }

    public string? SubfeatureDescription { get; set; }

    public bool SubfeatureIsSystem { get; set; }

    public DateTime SubfeatureCreatedAt { get; set; }

    public virtual ICollection<SubFeatureFlagRule> SubFeatureFlagRules { get; set; } = new List<SubFeatureFlagRule>();

    public virtual SysSubmoduleCode? SubfeatureModuleCodeNavigation { get; set; }

    public virtual SysSubfeatureFlagType SubfeatureTypeCodeNavigation { get; set; } = null!;
}
