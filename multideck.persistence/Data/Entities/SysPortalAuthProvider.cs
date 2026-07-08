using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalAuthProvider
{
    public string PortalAuthProviderCode { get; set; } = null!;

    public string PortalAuthProviderName { get; set; } = null!;

    public string? PortalAuthProviderDescription { get; set; }

    public bool PortalAuthProviderIsExternal { get; set; }

    public int PortalAuthProviderSortOrder { get; set; }

    public virtual ICollection<PortalExternalIdentity> PortalExternalIdentities { get; set; } = new List<PortalExternalIdentity>();
}
