using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalUserRole
{
    public Guid PortalUserRoleId { get; set; }

    public Guid PortalUserRolePortalUserId { get; set; }

    public Guid PortalUserRoleRoleId { get; set; }

    public Guid? PortalUserRoleSiteId { get; set; }

    public Guid? PortalUserRoleOrgId { get; set; }

    public string PortalUserRoleStatusCode { get; set; } = null!;

    public DateTime PortalUserRoleValidFrom { get; set; }

    public DateTime? PortalUserRoleValidUntil { get; set; }

    public DateTime PortalUserRoleAssignedAt { get; set; }

    public Guid? PortalUserRoleAssignedBy { get; set; }

    public virtual CmpUser? PortalUserRoleAssignedByNavigation { get; set; }

    public virtual OrgMaster? PortalUserRoleOrg { get; set; }

    public virtual PortalUser PortalUserRolePortalUser { get; set; } = null!;

    public virtual PortalRole PortalUserRoleRole { get; set; } = null!;

    public virtual PortalSite? PortalUserRoleSite { get; set; }

    public virtual SysPortalAccessStatus PortalUserRoleStatusCodeNavigation { get; set; } = null!;
}
