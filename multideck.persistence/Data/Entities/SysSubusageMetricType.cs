using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysSubusageMetricType
{
    public string SubusageMetricCode { get; set; } = null!;

    public string SubusageMetricName { get; set; } = null!;

    public string? SubusageMetricDescription { get; set; }

    public string? SubusageMetricUnit { get; set; }

    public bool SubusageMetricIsBillable { get; set; }

    public bool SubusageMetricIsActive { get; set; }

    public int SubusageMetricSortOrder { get; set; }

    public virtual ICollection<SubUsageMeter> SubUsageMeters { get; set; } = new List<SubUsageMeter>();
}
