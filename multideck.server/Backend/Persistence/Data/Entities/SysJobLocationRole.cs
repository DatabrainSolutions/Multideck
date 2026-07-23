using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobLocationRole
{
    public string JlrCode { get; set; } = null!;

    public string JlrName { get; set; } = null!;

    public string? JlrDescription { get; set; }

    public int JlrSortOrder { get; set; }

    public bool JlrIsActive { get; set; }

    public DateTime JlrCreatedAt { get; set; }

    public virtual ICollection<JobLocation> JobLocations { get; set; } = new List<JobLocation>();
}
