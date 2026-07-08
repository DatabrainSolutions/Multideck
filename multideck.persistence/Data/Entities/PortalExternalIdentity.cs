using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalExternalIdentity
{
    public Guid PortalIdentityId { get; set; }

    public Guid PortalIdentityPortalUserId { get; set; }

    public string PortalIdentityAuthProviderCode { get; set; } = null!;

    public string? PortalIdentityAuthMethodCode { get; set; }

    public string PortalIdentityExternalSubject { get; set; } = null!;

    public string? PortalIdentityExternalTenantId { get; set; }

    public string? PortalIdentityExternalUsername { get; set; }

    public string? PortalIdentityEmailSnapshot { get; set; }

    public string PortalIdentityStatusCode { get; set; } = null!;

    public DateTime? PortalIdentityLastVerifiedAt { get; set; }

    public string PortalIdentityMetadataJson { get; set; } = null!;

    public DateTime PortalIdentityCreatedAt { get; set; }

    public DateTime PortalIdentityUpdatedAt { get; set; }

    public virtual SysPortalAuthMethod? PortalIdentityAuthMethodCodeNavigation { get; set; }

    public virtual SysPortalAuthProvider PortalIdentityAuthProviderCodeNavigation { get; set; } = null!;

    public virtual PortalUser PortalIdentityPortalUser { get; set; } = null!;

    public virtual SysPortalAccessStatus PortalIdentityStatusCodeNavigation { get; set; } = null!;
}
