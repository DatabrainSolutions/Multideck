using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalAudienceType
{
    public string PortalAudienceTypeCode { get; set; } = null!;

    public string PortalAudienceTypeName { get; set; } = null!;

    public string? PortalAudienceTypeDescription { get; set; }

    public bool PortalAudienceTypeDefaultRequiresMfa { get; set; }

    public int PortalAudienceTypeSortOrder { get; set; }

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();

    public virtual ICollection<PortalRole> PortalRoles { get; set; } = new List<PortalRole>();

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual ICollection<PortalUser> PortalUsers { get; set; } = new List<PortalUser>();
}
