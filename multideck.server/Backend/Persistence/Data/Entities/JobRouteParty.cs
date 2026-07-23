using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobRouteParty
{
    public Guid JobRoutePartyId { get; set; }

    public Guid JobRoutePartyJobRouteId { get; set; }

    public string JobRoutePartyRole { get; set; } = null!;

    public Guid? JobRoutePartyOrgId { get; set; }

    public Guid? JobRoutePartyAddressId { get; set; }

    public Guid? JobRoutePartyContactId { get; set; }

    public string? JobRoutePartyNameSnapshot { get; set; }

    public string? JobRoutePartyAddressSnapshot { get; set; }

    public string? JobRoutePartyContactNameSnapshot { get; set; }

    public int JobRoutePartySequence { get; set; }

    public DateTime JobRoutePartyCreatedAt { get; set; }

    public virtual JobRouting JobRoutePartyJobRoute { get; set; } = null!;

    public virtual SysJobPartyRole JobRoutePartyRoleNavigation { get; set; } = null!;
}
