using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmPolicyParty
{
    public Guid ClmpolPartyId { get; set; }

    public Guid ClmpolPartyPolicyId { get; set; }

    public string ClmpolPartyRoleCode { get; set; } = null!;

    public Guid? ClmpolPartyOrgId { get; set; }

    public Guid? ClmpolPartyContactId { get; set; }

    public string? ClmpolPartyNameSnapshot { get; set; }

    public string? ClmpolPartyEmailSnapshot { get; set; }

    public string? ClmpolPartyPhoneSnapshot { get; set; }

    public string? ClmpolPartyReference { get; set; }

    public bool ClmpolPartyIsPrimary { get; set; }

    public string? ClmpolPartyNotes { get; set; }

    public DateTime ClmpolPartyCreatedAt { get; set; }

    public virtual OrgContact? ClmpolPartyContact { get; set; }

    public virtual OrgMaster? ClmpolPartyOrg { get; set; }

    public virtual ClmInsurancePolicy ClmpolPartyPolicy { get; set; } = null!;

    public virtual SysClmclaimPartyRole ClmpolPartyRoleCodeNavigation { get; set; } = null!;
}
