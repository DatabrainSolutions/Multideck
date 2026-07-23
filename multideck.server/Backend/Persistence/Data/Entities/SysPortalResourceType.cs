using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalResourceType
{
    public string PortalResourceTypeCode { get; set; } = null!;

    public string PortalResourceTypeName { get; set; } = null!;

    public string? PortalResourceTypeDescription { get; set; }

    public bool PortalResourceTypeDefaultRequiresExplicitShare { get; set; }

    public bool PortalResourceTypeIsSensitive { get; set; }

    public int PortalResourceTypeSortOrder { get; set; }

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalAuditEvent> PortalAuditEvents { get; set; } = new List<PortalAuditEvent>();

    public virtual ICollection<PortalFileUpload> PortalFileUploads { get; set; } = new List<PortalFileUpload>();

    public virtual ICollection<PortalNotificationSubscription> PortalNotificationSubscriptions { get; set; } = new List<PortalNotificationSubscription>();

    public virtual ICollection<PortalPublicLink> PortalPublicLinks { get; set; } = new List<PortalPublicLink>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalRolePermission> PortalRolePermissions { get; set; } = new List<PortalRolePermission>();
}
