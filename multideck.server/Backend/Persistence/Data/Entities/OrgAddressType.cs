using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgAddressType
{
    public Guid OrgAddId { get; set; }

    public int OrgAddTypeType { get; set; }

    public bool OrgAddTypeIsDefault { get; set; }

    public virtual OrgAddress OrgAdd { get; set; } = null!;

    public virtual SysAddressType OrgAddTypeTypeNavigation { get; set; } = null!;
}
