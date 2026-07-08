using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysFinanceCutoffRunType
{
    public string FincuttCode { get; set; } = null!;

    public string FincuttName { get; set; } = null!;

    public string? FincuttDescription { get; set; }

    public int FincuttSortOrder { get; set; }

    public bool FincuttIsActive { get; set; }

    public virtual ICollection<FinCutoffRun> FinCutoffRuns { get; set; } = new List<FinCutoffRun>();

    public virtual ICollection<FinPeriodCloseRun> FinPeriodCloseRuns { get; set; } = new List<FinPeriodCloseRun>();
}
