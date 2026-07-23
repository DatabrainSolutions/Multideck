using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsOrderParty
{
    public Guid WmsorderPartyId { get; set; }

    public Guid WmsorderPartyOrderId { get; set; }

    public string WmsorderPartyRoleCode { get; set; } = null!;

    public Guid? WmsorderPartyOrgId { get; set; }

    public string? WmsorderPartyContactName { get; set; }

    public string? WmsorderPartyEmail { get; set; }

    public string? WmsorderPartyPhone { get; set; }

    public string? WmsorderPartyNameSnapshot { get; set; }

    public string? WmsorderPartyAddressSnapshot { get; set; }

    public bool WmsorderPartyIsPrimary { get; set; }

    public DateTime WmsorderPartyCreatedAt { get; set; }

    public virtual WmsOrder WmsorderPartyOrder { get; set; } = null!;

    public virtual OrgMaster? WmsorderPartyOrg { get; set; }
}
