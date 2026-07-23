using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmcoverageType
{
    public string ClmcoverageTypeCode { get; set; } = null!;

    public string ClmcoverageTypeName { get; set; } = null!;

    public string? ClmcoverageTypeDescription { get; set; }

    public bool ClmcoverageTypeIsActive { get; set; }

    public int ClmcoverageTypeSortOrder { get; set; }

    public virtual ICollection<ClmPolicyCoverage> ClmPolicyCoverages { get; set; } = new List<ClmPolicyCoverage>();
}
