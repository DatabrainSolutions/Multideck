using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmincidentStatus
{
    public string ClmincidentStatusCode { get; set; } = null!;

    public string ClmincidentStatusName { get; set; } = null!;

    public string? ClmincidentStatusDescription { get; set; }

    public bool ClmincidentStatusIsOpen { get; set; }

    public bool ClmincidentStatusIsClaimOpened { get; set; }

    public bool ClmincidentStatusIsActive { get; set; }

    public int ClmincidentStatusSortOrder { get; set; }

    public virtual ICollection<ClmIncident> ClmIncidents { get; set; } = new List<ClmIncident>();
}
