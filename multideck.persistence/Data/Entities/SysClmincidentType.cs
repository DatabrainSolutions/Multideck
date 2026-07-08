using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmincidentType
{
    public string ClmincidentTypeCode { get; set; } = null!;

    public string ClmincidentTypeName { get; set; } = null!;

    public string? ClmincidentTypeDescription { get; set; }

    public bool ClmincidentTypeIsClaimCandidate { get; set; }

    public bool ClmincidentTypeIsActive { get; set; }

    public int ClmincidentTypeSortOrder { get; set; }

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();
}
