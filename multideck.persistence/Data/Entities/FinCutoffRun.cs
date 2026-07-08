using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCutoffRun
{
    public Guid FincutoffId { get; set; }

    public string FincutoffRunTypeCode { get; set; } = null!;

    public string FincutoffStatusCode { get; set; } = null!;

    public Guid FincutoffPeriodId { get; set; }

    public Guid? FincutoffLegalEntityId { get; set; }

    public Guid? FincutoffOrgOfficeId { get; set; }

    public DateOnly FincutoffAccountingDateFrom { get; set; }

    public DateOnly FincutoffAccountingDateTo { get; set; }

    public decimal FincutoffTotalWipamount { get; set; }

    public decimal FincutoffTotalAccrualAmount { get; set; }

    public int FincutoffExceptionCount { get; set; }

    public DateTime FincutoffStartedAt { get; set; }

    public Guid? FincutoffStartedBy { get; set; }

    public DateTime? FincutoffCompletedAt { get; set; }

    public virtual ICollection<FinCutoffRunItem> FinCutoffRunItems { get; set; } = new List<FinCutoffRunItem>();

    public virtual CmpLegalEntity? FincutoffLegalEntity { get; set; }

    public virtual CmpOffice? FincutoffOrgOffice { get; set; }

    public virtual FinPeriod FincutoffPeriod { get; set; } = null!;

    public virtual SysFinanceCutoffRunType FincutoffRunTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? FincutoffStartedByNavigation { get; set; }
}
