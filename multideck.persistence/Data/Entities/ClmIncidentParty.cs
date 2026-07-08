using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ClmIncidentParty
{
    public Guid ClmincPartyId { get; set; }

    public Guid ClmincPartyIncidentId { get; set; }

    public string ClmincPartyRoleCode { get; set; } = null!;

    public Guid? ClmincPartyOrgId { get; set; }

    public Guid? ClmincPartyContactId { get; set; }

    public string? ClmincPartyNameSnapshot { get; set; }

    public string? ClmincPartyEmailSnapshot { get; set; }

    public string? ClmincPartyPhoneSnapshot { get; set; }

    public string? ClmincPartyReference { get; set; }

    public string? ClmincPartyLiabilityStatusCode { get; set; }

    public bool ClmincPartyIsPotentiallyResponsible { get; set; }

    public string? ClmincPartyNotes { get; set; }

    public DateTime ClmincPartyCreatedAt { get; set; }

    public virtual OrgContact? ClmincPartyContact { get; set; }

    public virtual ClmIncident ClmincPartyIncident { get; set; } = null!;

    public virtual SysClmliabilityStatus? ClmincPartyLiabilityStatusCodeNavigation { get; set; }

    public virtual OrgMaster? ClmincPartyOrg { get; set; }

    public virtual SysClmclaimPartyRole ClmincPartyRoleCodeNavigation { get; set; } = null!;
}
