using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAddressType
{
    public int SysAddressTypeId { get; set; }

    public string? SysAddressTypeDescription { get; set; }

    public virtual ICollection<OrgAddressType> OrgAddressTypes { get; set; } = new List<OrgAddressType>();
}
