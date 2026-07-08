using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalApiclient
{
    public Guid PortalApiclientId { get; set; }

    public Guid? PortalApiclientSiteId { get; set; }

    public Guid? PortalApiclientOrgId { get; set; }

    public string PortalApiclientName { get; set; } = null!;

    public string PortalApiclientStatusCode { get; set; } = null!;

    public string PortalApiclientClientIdentifier { get; set; } = null!;

    public string PortalApiclientAllowedScopesJson { get; set; } = null!;

    public string PortalApiclientAllowedIprangesJson { get; set; } = null!;

    public string? PortalApiclientWebhookUrl { get; set; }

    public string? PortalApiclientWebhookSecretRef { get; set; }

    public DateTime PortalApiclientValidFrom { get; set; }

    public DateTime? PortalApiclientValidUntil { get; set; }

    public DateTime? PortalApiclientLastUsedAt { get; set; }

    public DateTime PortalApiclientCreatedAt { get; set; }

    public Guid? PortalApiclientCreatedBy { get; set; }

    public DateTime PortalApiclientUpdatedAt { get; set; }

    public Guid? PortalApiclientUpdatedBy { get; set; }

    public virtual ICollection<PortalApiaccessToken> PortalApiaccessTokens { get; set; } = new List<PortalApiaccessToken>();

    public virtual CmpUser? PortalApiclientCreatedByNavigation { get; set; }

    public virtual OrgMaster? PortalApiclientOrg { get; set; }

    public virtual PortalSite? PortalApiclientSite { get; set; }

    public virtual SysPortalApiclientStatus PortalApiclientStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalApiclientUpdatedByNavigation { get; set; }

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();
}
