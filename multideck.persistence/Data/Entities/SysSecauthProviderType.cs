using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecauthProviderType
{
    public string SecauthProviderCode { get; set; } = null!;

    public string SecauthProviderName { get; set; } = null!;

    public string? SecauthProviderDescription { get; set; }

    public bool SecauthProviderIsActive { get; set; }

    public int SecauthProviderSortOrder { get; set; }

    public virtual ICollection<SecAuthIdentityLink> SecAuthIdentityLinks { get; set; } = new List<SecAuthIdentityLink>();
}
