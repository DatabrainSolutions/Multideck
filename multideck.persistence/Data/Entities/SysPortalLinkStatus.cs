using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalLinkStatus
{
    public string PortalLinkStatusCode { get; set; } = null!;

    public string PortalLinkStatusName { get; set; } = null!;

    public string? PortalLinkStatusDescription { get; set; }

    public bool PortalLinkStatusIsFinal { get; set; }

    public int PortalLinkStatusSortOrder { get; set; }

    public virtual ICollection<PortalPublicLink> PortalPublicLinks { get; set; } = new List<PortalPublicLink>();
}
