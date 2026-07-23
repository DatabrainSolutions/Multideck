using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalApiclientStatus
{
    public string PortalApiclientStatusCode { get; set; } = null!;

    public string PortalApiclientStatusName { get; set; } = null!;

    public string? PortalApiclientStatusDescription { get; set; }

    public bool PortalApiclientStatusIsFinal { get; set; }

    public int PortalApiclientStatusSortOrder { get; set; }

    public virtual ICollection<PortalApiaccessToken> PortalApiaccessTokens { get; set; } = new List<PortalApiaccessToken>();

    public virtual ICollection<PortalApiclient> PortalApiclients { get; set; } = new List<PortalApiclient>();
}
