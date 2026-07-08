using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobParty
{
    public Guid JobPartyId { get; set; }

    public Guid JobPartyJobId { get; set; }

    public string JobPartyRole { get; set; } = null!;

    public Guid? JobPartyOrgId { get; set; }

    public Guid? JobPartyAddressId { get; set; }

    public Guid? JobPartyContactId { get; set; }

    public int JobPartySequence { get; set; }

    public string? JobPartyNameSnapshot { get; set; }

    public string? JobPartyAddressSnapshot { get; set; }

    public string? JobPartyContactNameSnapshot { get; set; }

    public string? JobPartyEmailSnapshot { get; set; }

    public string? JobPartyPhoneSnapshot { get; set; }

    public string? JobPartyCountryCodeSnapshot { get; set; }

    public string? JobPartyIdentifierType { get; set; }

    public string? JobPartyIdentifierValueSnapshot { get; set; }

    public bool JobPartyIsPrimary { get; set; }

    public string JobPartyRawSnapshot { get; set; } = null!;

    public DateTime JobPartyCreatedAt { get; set; }

    public Guid? JobPartyCreatedBy { get; set; }

    public virtual JobHeader JobPartyJob { get; set; } = null!;

    public virtual SysJobPartyRole JobPartyRoleNavigation { get; set; } = null!;
}
