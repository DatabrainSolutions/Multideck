using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalAuthMethod
{
    public string PortalAuthMethodCode { get; set; } = null!;

    public string PortalAuthMethodName { get; set; } = null!;

    public string? PortalAuthMethodDescription { get; set; }

    public bool PortalAuthMethodIsInteractive { get; set; }

    public int PortalAuthMethodSortOrder { get; set; }

    public virtual ICollection<PortalExternalIdentity> PortalExternalIdentities { get; set; } = new List<PortalExternalIdentity>();
}
