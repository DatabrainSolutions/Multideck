using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalNotificationSubscription
{
    public Guid PortalSubId { get; set; }

    public Guid? PortalSubSiteId { get; set; }

    public Guid? PortalSubPortalUserId { get; set; }

    public Guid? PortalSubOrgId { get; set; }

    public string PortalSubResourceTypeCode { get; set; } = null!;

    public string? PortalSubTargetTable { get; set; }

    public Guid? PortalSubTargetId { get; set; }

    public string PortalSubChannelsJson { get; set; } = null!;

    public string PortalSubEventFiltersJson { get; set; } = null!;

    public bool PortalSubIsActive { get; set; }

    public DateTime PortalSubCreatedAt { get; set; }

    public Guid? PortalSubCreatedBy { get; set; }

    public virtual CmpUser? PortalSubCreatedByNavigation { get; set; }

    public virtual OrgMaster? PortalSubOrg { get; set; }

    public virtual PortalUser? PortalSubPortalUser { get; set; }

    public virtual SysPortalResourceType PortalSubResourceTypeCodeNavigation { get; set; } = null!;

    public virtual PortalSite? PortalSubSite { get; set; }
}
