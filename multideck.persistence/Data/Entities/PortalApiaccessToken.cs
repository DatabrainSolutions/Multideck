using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalApiaccessToken
{
    public Guid PortalApitokenId { get; set; }

    public Guid PortalApitokenApiclientId { get; set; }

    public string PortalApitokenName { get; set; } = null!;

    public string PortalApitokenTokenHashSha256 { get; set; } = null!;

    public string PortalApitokenStatusCode { get; set; } = null!;

    public string PortalApitokenAllowedScopesJson { get; set; } = null!;

    public DateTime? PortalApitokenLastUsedAt { get; set; }

    public DateTime? PortalApitokenExpiresAt { get; set; }

    public DateTime? PortalApitokenRevokedAt { get; set; }

    public Guid? PortalApitokenRevokedBy { get; set; }

    public DateTime PortalApitokenCreatedAt { get; set; }

    public Guid? PortalApitokenCreatedBy { get; set; }

    public virtual PortalApiclient PortalApitokenApiclient { get; set; } = null!;

    public virtual CmpUser? PortalApitokenCreatedByNavigation { get; set; }

    public virtual CmpUser? PortalApitokenRevokedByNavigation { get; set; }

    public virtual SysPortalApiclientStatus PortalApitokenStatusCodeNavigation { get; set; } = null!;
}
