using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciPartyMapping
{
    public Guid AccipmId { get; set; }

    public Guid AccipmConnectionId { get; set; }

    public Guid AccipmOrgId { get; set; }

    public string AccipmPartyType { get; set; } = null!;

    public string AccipmProviderPartyId { get; set; } = null!;

    public string? AccipmProviderPartyCode { get; set; }

    public string? AccipmProviderPartyName { get; set; }

    public DateTime? AccipmLastSyncedAt { get; set; }

    public bool AccipmIsActive { get; set; }

    public DateTime AccipmCreatedAt { get; set; }

    public virtual AcciConnection AccipmConnection { get; set; } = null!;

    public virtual OrgMaster AccipmOrg { get; set; } = null!;
}
