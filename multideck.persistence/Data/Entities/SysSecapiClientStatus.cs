using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSecapiClientStatus
{
    public string SecapiClientStatusCode { get; set; } = null!;

    public string SecapiClientStatusName { get; set; } = null!;

    public string? SecapiClientStatusDescription { get; set; }

    public bool SecapiClientStatusIsUsable { get; set; }

    public bool SecapiClientStatusIsActive { get; set; }

    public int SecapiClientStatusSortOrder { get; set; }

    public virtual ICollection<SecApiclient> SecApiclients { get; set; } = new List<SecApiclient>();

    public virtual ICollection<SecApitokenHash> SecApitokenHashes { get; set; } = new List<SecApitokenHash>();
}
