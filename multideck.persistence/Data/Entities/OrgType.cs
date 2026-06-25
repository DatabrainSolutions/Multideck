using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class OrgType
{
    public Guid OrgTypeId { get; set; }

    public string OrgTypeName { get; set; } = null!;

    public string? OrgTypeOrder { get; set; }

    public virtual ICollection<OrgMaster> Orgs { get; set; } = new List<OrgMaster>();
}
