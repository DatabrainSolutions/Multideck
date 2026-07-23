using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobTrackingExceptionType
{
    public string JtexCode { get; set; } = null!;

    public string JtexName { get; set; } = null!;

    public string? JtexDescription { get; set; }

    public string? JtexDefaultSeverity { get; set; }

    public int JtexSortOrder { get; set; }

    public bool JtexIsActive { get; set; }

    public DateTime JtexCreatedAt { get; set; }

    public virtual ICollection<JobTrackingException> JobTrackingExceptions { get; set; } = new List<JobTrackingException>();
}
