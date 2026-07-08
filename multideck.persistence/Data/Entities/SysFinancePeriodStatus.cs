using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinancePeriodStatus
{
    public string FinperstCode { get; set; } = null!;

    public string FinperstName { get; set; } = null!;

    public string? FinperstDescription { get; set; }

    public bool FinperstIsLocked { get; set; }

    public int FinperstSortOrder { get; set; }

    public bool FinperstIsActive { get; set; }

    public virtual ICollection<FinPeriod> FinPeriods { get; set; } = new List<FinPeriod>();
}
