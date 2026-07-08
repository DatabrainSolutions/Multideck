using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysJobKpidefinition
{
    public string JkpiCode { get; set; } = null!;

    public string JkpiName { get; set; } = null!;

    public string? JkpiDescription { get; set; }

    public string? JkpiUnit { get; set; }

    public string JkpiTargetDirection { get; set; } = null!;

    public decimal? JkpiDefaultTargetValue { get; set; }

    public int JkpiSortOrder { get; set; }

    public bool JkpiIsActive { get; set; }

    public DateTime JkpiCreatedAt { get; set; }

    public virtual ICollection<JobKpiresult> JobKpiresults { get; set; } = new List<JobKpiresult>();
}
