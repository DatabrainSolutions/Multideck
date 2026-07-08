using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsfacilityType
{
    public string WmsfacilityTypeCode { get; set; } = null!;

    public string WmsfacilityTypeName { get; set; } = null!;

    public string? WmsfacilityTypeDescription { get; set; }

    public bool WmsfacilityTypeIsBondedCandidate { get; set; }

    public bool WmsfacilityTypeIsActive { get; set; }

    public int WmsfacilityTypeSortOrder { get; set; }

    public virtual ICollection<WmsFacility> WmsFacilities { get; set; } = new List<WmsFacility>();
}
