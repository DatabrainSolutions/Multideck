using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPeriodCloseRun
{
    public Guid FincloseRunId { get; set; }

    public Guid FincloseRunPeriodId { get; set; }

    public string FincloseRunRunTypeCode { get; set; } = null!;

    public string FincloseRunStatusCode { get; set; } = null!;

    public DateTime FincloseRunStartedAt { get; set; }

    public Guid? FincloseRunStartedBy { get; set; }

    public DateTime? FincloseRunCompletedAt { get; set; }

    public DateTime? FincloseRunApprovedAt { get; set; }

    public Guid? FincloseRunApprovedBy { get; set; }

    public string FincloseRunControlTotalsJson { get; set; } = null!;

    public virtual ICollection<FinPeriodCloseRunItem> FinPeriodCloseRunItems { get; set; } = new List<FinPeriodCloseRunItem>();

    public virtual CmpUser? FincloseRunApprovedByNavigation { get; set; }

    public virtual FinPeriod FincloseRunPeriod { get; set; } = null!;

    public virtual SysFinanceCutoffRunType FincloseRunRunTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FincloseRunStartedByNavigation { get; set; }
}
