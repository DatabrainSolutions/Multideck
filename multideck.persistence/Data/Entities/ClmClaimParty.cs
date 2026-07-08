using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmClaimParty
{
    public Guid ClmclaimPartyId { get; set; }

    public Guid ClmclaimPartyClaimId { get; set; }

    public string ClmclaimPartyRoleCode { get; set; } = null!;

    public Guid? ClmclaimPartyOrgId { get; set; }

    public Guid? ClmclaimPartyContactId { get; set; }

    public string? ClmclaimPartyNameSnapshot { get; set; }

    public string? ClmclaimPartyEmailSnapshot { get; set; }

    public string? ClmclaimPartyPhoneSnapshot { get; set; }

    public string? ClmclaimPartyReference { get; set; }

    public string? ClmclaimPartyLiabilityStatusCode { get; set; }

    public bool ClmclaimPartyIsPrimary { get; set; }

    public string? ClmclaimPartyNotes { get; set; }

    public DateTime ClmclaimPartyCreatedAt { get; set; }

    public virtual ClmClaim ClmclaimPartyClaim { get; set; } = null!;

    public virtual OrgContact? ClmclaimPartyContact { get; set; }

    public virtual SysClmliabilityStatus? ClmclaimPartyLiabilityStatusCodeNavigation { get; set; }

    public virtual OrgMaster? ClmclaimPartyOrg { get; set; }

    public virtual SysClmclaimPartyRole ClmclaimPartyRoleCodeNavigation { get; set; } = null!;
}
