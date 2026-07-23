using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmcauseCode
{
    public string ClmcauseCode { get; set; } = null!;

    public string ClmcauseName { get; set; } = null!;

    public string? ClmcauseDescription { get; set; }

    public bool ClmcauseIsActive { get; set; }

    public int ClmcauseSortOrder { get; set; }

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();
}
