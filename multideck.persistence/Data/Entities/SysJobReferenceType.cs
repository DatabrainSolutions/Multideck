using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobReferenceType
{
    public string JrtCode { get; set; } = null!;

    public string JrtName { get; set; } = null!;

    public string? JrtDescription { get; set; }

    public int JrtSortOrder { get; set; }

    public bool JrtIsActive { get; set; }

    public DateTime JrtCreatedAt { get; set; }

    public virtual ICollection<JobReference> JobReferences { get; set; } = new List<JobReference>();
}
