using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobMilestoneType
{
    public string JmtCode { get; set; } = null!;

    public string JmtName { get; set; } = null!;

    public string? JmtDescription { get; set; }

    public int JmtSortOrder { get; set; }

    public bool JmtIsActive { get; set; }

    public DateTime JmtCreatedAt { get; set; }

    public virtual ICollection<JobRouteMilestone> JobRouteMilestones { get; set; } = new List<JobRouteMilestone>();
}
