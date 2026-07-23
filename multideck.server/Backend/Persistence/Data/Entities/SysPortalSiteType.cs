using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalSiteType
{
    public string PortalSiteTypeCode { get; set; } = null!;

    public string PortalSiteTypeName { get; set; } = null!;

    public string? PortalSiteTypeDescription { get; set; }

    public bool PortalSiteTypeIsExternal { get; set; }

    public int PortalSiteTypeSortOrder { get; set; }

    public virtual ICollection<PortalSite> PortalSites { get; set; } = new List<PortalSite>();
}
