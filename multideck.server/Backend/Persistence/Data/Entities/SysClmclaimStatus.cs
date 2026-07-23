using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmclaimStatus
{
    public string ClmclaimStatusCode { get; set; } = null!;

    public string ClmclaimStatusName { get; set; } = null!;

    public string? ClmclaimStatusDescription { get; set; }

    public bool ClmclaimStatusIsOpen { get; set; }

    public bool ClmclaimStatusIsFinal { get; set; }

    public bool ClmclaimStatusIsActive { get; set; }

    public int ClmclaimStatusSortOrder { get; set; }

    public virtual ICollection<ClmClaimEvent> ClmClaimEventClmeventStatusFromCodeNavigations { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmClaimEvent> ClmClaimEventClmeventStatusToCodeNavigations { get; set; } = new List<ClmClaimEvent>();

    public virtual ICollection<ClmClaim> ClmClaims { get; set; } = new List<ClmClaim>();
}
