using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmclaimPartyRole
{
    public string ClmclaimPartyRoleCode { get; set; } = null!;

    public string ClmclaimPartyRoleName { get; set; } = null!;

    public string? ClmclaimPartyRoleDescription { get; set; }

    public bool ClmclaimPartyRoleIsActive { get; set; }

    public int ClmclaimPartyRoleSortOrder { get; set; }

    public virtual ICollection<ClmClaimParty> ClmClaimParties { get; set; } = new List<ClmClaimParty>();

    public virtual ICollection<ClmClaimRecovery> ClmClaimRecoveries { get; set; } = new List<ClmClaimRecovery>();

    public virtual ICollection<ClmIncidentParty> ClmIncidentParties { get; set; } = new List<ClmIncidentParty>();

    public virtual ICollection<ClmPolicyParty> ClmPolicyParties { get; set; } = new List<ClmPolicyParty>();
}
