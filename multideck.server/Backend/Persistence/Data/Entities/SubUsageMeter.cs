using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubUsageMeter
{
    public Guid SubusageMeterId { get; set; }

    public string SubusageMeterCode { get; set; } = null!;

    public string SubusageMeterMetricCode { get; set; } = null!;

    public string? SubusageMeterModuleCode { get; set; }

    public string SubusageMeterName { get; set; } = null!;

    public string? SubusageMeterDescription { get; set; }

    public bool SubusageMeterIsActive { get; set; }

    public virtual ICollection<SubUsageSnapshot> SubUsageSnapshots { get; set; } = new List<SubUsageSnapshot>();

    public virtual SysSubusageMetricType SubusageMeterMetricCodeNavigation { get; set; } = null!;

    public virtual SysSubmoduleCode? SubusageMeterModuleCodeNavigation { get; set; }
}
