using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobLegType
{
    public string JltCode { get; set; } = null!;

    public string JltName { get; set; } = null!;

    public string? JltDescription { get; set; }

    public int JltSortOrder { get; set; }

    public bool JltIsActive { get; set; }

    public DateTime JltCreatedAt { get; set; }

    public virtual ICollection<JobRouting> JobRoutings { get; set; } = new List<JobRouting>();
}
