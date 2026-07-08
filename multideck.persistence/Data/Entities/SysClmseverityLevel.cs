using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmseverityLevel
{
    public string ClmseverityCode { get; set; } = null!;

    public string ClmseverityName { get; set; } = null!;

    public string? ClmseverityDescription { get; set; }

    public int ClmseverityWeight { get; set; }

    public bool ClmseverityIsActive { get; set; }

    public int ClmseveritySortOrder { get; set; }

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();
}
