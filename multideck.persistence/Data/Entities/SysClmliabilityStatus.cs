using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmliabilityStatus
{
    public string ClmliabilityStatusCode { get; set; } = null!;

    public string ClmliabilityStatusName { get; set; } = null!;

    public string? ClmliabilityStatusDescription { get; set; }

    public bool ClmliabilityStatusIsActive { get; set; }

    public int ClmliabilityStatusSortOrder { get; set; }

    public virtual ICollection<ClmClaimParty> ClmClaimParties { get; set; } = new List<ClmClaimParty>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();

    public virtual ICollection<ClmIncidentParty> ClmIncidentParties { get; set; } = new List<ClmIncidentParty>();
}
