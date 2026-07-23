using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class PortalRole
{
    public Guid PortalRoleId { get; set; }

    public Guid? PortalRoleSiteId { get; set; }

    public string PortalRoleCode { get; set; } = null!;

    public string PortalRoleName { get; set; } = null!;

    public string? PortalRoleDescription { get; set; }

    public string? PortalRoleAudienceTypeCode { get; set; }

    public bool PortalRoleIsSystemRole { get; set; }

    public bool PortalRoleIsEnabled { get; set; }

    public DateTime PortalRoleCreatedAt { get; set; }

    public Guid? PortalRoleCreatedBy { get; set; }

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual SysPortalAudienceType? PortalRoleAudienceTypeCodeNavigation { get; set; }

    public virtual CmpUser? PortalRoleCreatedByNavigation { get; set; }

    public virtual ICollection<PortalRolePermission> PortalRolePermissions { get; set; } = new List<PortalRolePermission>();

    public virtual PortalSite? PortalRoleSite { get; set; }

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();
}
