using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SubUsageSnapshot
{
    public Guid SubusageSnapId { get; set; }

    public Guid SubusageSnapMeterId { get; set; }

    public DateOnly SubusageSnapPeriodStartDate { get; set; }

    public DateOnly SubusageSnapPeriodEndDate { get; set; }

    public Guid? SubusageSnapOrgOfficeId { get; set; }

    public decimal SubusageSnapValue { get; set; }

    public decimal? SubusageSnapLimitValue { get; set; }

    public string SubusageSnapSourceJson { get; set; } = null!;

    public DateTime SubusageSnapCalculatedAt { get; set; }

    public virtual SubUsageMeter SubusageSnapMeter { get; set; } = null!;

    public virtual CmpOffice? SubusageSnapOrgOffice { get; set; }
}
