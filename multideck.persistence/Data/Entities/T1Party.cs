using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1Party
{
    public Guid T1pId { get; set; }

    public Guid T1pT1id { get; set; }

    public Guid? T1pT1itemId { get; set; }

    public string T1pRole { get; set; } = null!;

    public Guid? T1pOrgId { get; set; }

    public string? T1pNameSnapshot { get; set; }

    public string? T1pEorinumberSnapshot { get; set; }

    public string T1pAddressJson { get; set; } = null!;

    public int T1pSortOrder { get; set; }

    public DateTime T1pCreatedAt { get; set; }

    public virtual SysCustomsPartyRole T1pRoleNavigation { get; set; } = null!;

    public virtual T1Declaration T1pT1 { get; set; } = null!;

    public virtual T1Item? T1pT1item { get; set; }
}
