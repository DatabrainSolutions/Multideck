using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalAccessStatus
{
    public string PortalAccessStatusCode { get; set; } = null!;

    public string PortalAccessStatusName { get; set; } = null!;

    public string? PortalAccessStatusDescription { get; set; }

    public bool PortalAccessStatusIsFinal { get; set; }

    public int PortalAccessStatusSortOrder { get; set; }

    public virtual ICollection<PortalDocumentShare> PortalDocumentShares { get; set; } = new List<PortalDocumentShare>();

    public virtual ICollection<PortalExternalIdentity> PortalExternalIdentities { get; set; } = new List<PortalExternalIdentity>();

    public virtual ICollection<PortalRecordShare> PortalRecordShares { get; set; } = new List<PortalRecordShare>();

    public virtual ICollection<PortalSiteDomain> PortalSiteDomains { get; set; } = new List<PortalSiteDomain>();

    public virtual ICollection<PortalThreadAccess> PortalThreadAccesses { get; set; } = new List<PortalThreadAccess>();

    public virtual ICollection<PortalUserOrganisation> PortalUserOrganisations { get; set; } = new List<PortalUserOrganisation>();

    public virtual ICollection<PortalUserRole> PortalUserRoles { get; set; } = new List<PortalUserRole>();

    public virtual ICollection<PortalUser> PortalUsers { get; set; } = new List<PortalUser>();
}
