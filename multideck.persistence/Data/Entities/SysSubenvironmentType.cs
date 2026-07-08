using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSubenvironmentType
{
    public string SubenvTypeCode { get; set; } = null!;

    public string SubenvTypeName { get; set; } = null!;

    public string? SubenvTypeDescription { get; set; }

    public bool SubenvTypeIsActive { get; set; }

    public int SubenvTypeSortOrder { get; set; }

    public virtual ICollection<SubClientEnvironment> SubClientEnvironments { get; set; } = new List<SubClientEnvironment>();
}
