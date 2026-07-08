using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobDirection
{
    public string JdCode { get; set; } = null!;

    public string JdName { get; set; } = null!;

    public string? JdDescription { get; set; }

    public int JdSortOrder { get; set; }

    public bool JdIsActive { get; set; }

    public DateTime JdCreatedAt { get; set; }

    public virtual ICollection<JobHeader> JobHeaders { get; set; } = new List<JobHeader>();
}
