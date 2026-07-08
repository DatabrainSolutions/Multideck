using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobPartyRole
{
    public string JprCode { get; set; } = null!;

    public string JprName { get; set; } = null!;

    public string? JprDescription { get; set; }

    public bool JprIsRequiredTypical { get; set; }

    public int JprSortOrder { get; set; }

    public bool JprIsActive { get; set; }

    public DateTime JprCreatedAt { get; set; }

    public virtual ICollection<JobParty> JobParties { get; set; } = new List<JobParty>();

    public virtual ICollection<JobRouteParty> JobRouteParties { get; set; } = new List<JobRouteParty>();
}
