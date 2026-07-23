using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalRolePermission
{
    public Guid PortalRolePermId { get; set; }

    public Guid PortalRolePermRoleId { get; set; }

    public string PortalRolePermResourceTypeCode { get; set; } = null!;

    public string PortalRolePermActionCode { get; set; } = null!;

    public bool PortalRolePermIsAllowed { get; set; }

    public bool PortalRolePermRequiresExplicitShare { get; set; }

    public bool PortalRolePermRequiresInternalReview { get; set; }

    public string PortalRolePermFieldAllowListJson { get; set; } = null!;

    public string PortalRolePermFieldDenyListJson { get; set; } = null!;

    public DateTime PortalRolePermCreatedAt { get; set; }

    public virtual SysPortalPermissionAction PortalRolePermActionCodeNavigation { get; set; } = null!;

    public virtual SysPortalResourceType PortalRolePermResourceTypeCodeNavigation { get; set; } = null!;

    public virtual PortalRole PortalRolePermRole { get; set; } = null!;
}
