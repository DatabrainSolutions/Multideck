using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalPublicLink
{
    public Guid PortalLinkId { get; set; }

    public Guid? PortalLinkSiteId { get; set; }

    public string PortalLinkStatusCode { get; set; } = null!;

    public string PortalLinkResourceTypeCode { get; set; } = null!;

    public string PortalLinkTargetTable { get; set; } = null!;

    public Guid PortalLinkTargetId { get; set; }

    public string PortalLinkActionCode { get; set; } = null!;

    public string PortalLinkTokenHashSha256 { get; set; } = null!;

    public string? PortalLinkUrl { get; set; }

    public DateTime? PortalLinkExpiresAt { get; set; }

    public int? PortalLinkMaxUseCount { get; set; }

    public int PortalLinkUseCount { get; set; }

    public DateTime? PortalLinkLastUsedAt { get; set; }

    public DateTime? PortalLinkRevokedAt { get; set; }

    public Guid? PortalLinkRevokedBy { get; set; }

    public string? PortalLinkRevocationReason { get; set; }

    public string PortalLinkFieldPolicyJson { get; set; } = null!;

    public DateTime PortalLinkCreatedAt { get; set; }

    public Guid? PortalLinkCreatedBy { get; set; }

    public virtual SysPortalPermissionAction PortalLinkActionCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalLinkCreatedByNavigation { get; set; }

    public virtual SysPortalResourceType PortalLinkResourceTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? PortalLinkRevokedByNavigation { get; set; }

    public virtual PortalSite? PortalLinkSite { get; set; }

    public virtual SysPortalLinkStatus PortalLinkStatusCodeNavigation { get; set; } = null!;
}
