using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalPermissionAction
{
    public string PortalPermissionActionCode { get; set; } = null!;

    public string PortalPermissionActionName { get; set; } = null!;

    public string? PortalPermissionActionDescription { get; set; }

    public bool PortalPermissionActionIsWriteAction { get; set; }

    public int PortalPermissionActionSortOrder { get; set; }

    public virtual ICollection<PortalPublicLink> PortalPublicLinks { get; set; } = new List<PortalPublicLink>();

    public virtual ICollection<PortalRolePermission> PortalRolePermissions { get; set; } = new List<PortalRolePermission>();
}
