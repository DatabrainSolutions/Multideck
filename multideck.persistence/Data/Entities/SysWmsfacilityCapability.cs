using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsfacilityCapability
{
    public string WmscapabilityCode { get; set; } = null!;

    public string WmscapabilityName { get; set; } = null!;

    public string? WmscapabilityDescription { get; set; }

    public bool WmscapabilityIsComplianceSensitive { get; set; }

    public bool WmscapabilityIsActive { get; set; }

    public int WmscapabilitySortOrder { get; set; }

    public virtual ICollection<WmsFacilityCapability> WmsFacilityCapabilities { get; set; } = new List<WmsFacilityCapability>();
}
