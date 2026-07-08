using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSubfeatureFlagType
{
    public string SubfeatureTypeCode { get; set; } = null!;

    public string SubfeatureTypeName { get; set; } = null!;

    public string? SubfeatureTypeDescription { get; set; }

    public bool SubfeatureTypeIsActive { get; set; }

    public int SubfeatureTypeSortOrder { get; set; }

    public virtual ICollection<SubFeatureFlag> SubFeatureFlags { get; set; } = new List<SubFeatureFlag>();
}
