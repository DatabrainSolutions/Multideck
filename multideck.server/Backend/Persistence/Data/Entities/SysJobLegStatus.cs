using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobLegStatus
{
    public string JlsCode { get; set; } = null!;

    public string JlsName { get; set; } = null!;

    public string? JlsDescription { get; set; }

    public bool JlsIsFinal { get; set; }

    public int JlsSortOrder { get; set; }

    public bool JlsIsActive { get; set; }

    public DateTime JlsCreatedAt { get; set; }

    public virtual ICollection<JobRouting> JobRoutings { get; set; } = new List<JobRouting>();
}
