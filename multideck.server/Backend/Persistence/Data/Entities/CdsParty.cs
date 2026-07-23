using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CdsParty
{
    public Guid CdspId { get; set; }

    public Guid CdspCdsid { get; set; }

    public Guid? CdspCdsitemId { get; set; }

    public string CdspRole { get; set; } = null!;

    public Guid? CdspOrgId { get; set; }

    public string? CdspNameSnapshot { get; set; }

    public string? CdspEorinumberSnapshot { get; set; }

    public string? CdspAddressLine1Snapshot { get; set; }

    public string? CdspAddressLine2Snapshot { get; set; }

    public string? CdspCitySnapshot { get; set; }

    public string? CdspPostcodeSnapshot { get; set; }

    public string? CdspCountryCodeSnapshot { get; set; }

    public string? CdspContactNameSnapshot { get; set; }

    public string? CdspEmailSnapshot { get; set; }

    public string? CdspPhoneSnapshot { get; set; }

    public int CdspSortOrder { get; set; }

    public DateTime CdspCreatedAt { get; set; }

    public virtual CdsDeclaration CdspCds { get; set; } = null!;

    public virtual CdsItem? CdspCdsitem { get; set; }

    public virtual SysCustomsPartyRole CdspRoleNavigation { get; set; } = null!;
}
