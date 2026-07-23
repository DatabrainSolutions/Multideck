using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalSiteDomain
{
    public Guid PortalDomainId { get; set; }

    public Guid PortalDomainSiteId { get; set; }

    public string PortalDomainHostname { get; set; } = null!;

    public bool PortalDomainIsPrimary { get; set; }

    public string PortalDomainStatusCode { get; set; } = null!;

    public bool PortalDomainTlsmanagedExternally { get; set; }

    public DateTime? PortalDomainVerifiedAt { get; set; }

    public DateTime PortalDomainCreatedAt { get; set; }

    public virtual PortalSite PortalDomainSite { get; set; } = null!;

    public virtual SysPortalAccessStatus PortalDomainStatusCodeNavigation { get; set; } = null!;
}
