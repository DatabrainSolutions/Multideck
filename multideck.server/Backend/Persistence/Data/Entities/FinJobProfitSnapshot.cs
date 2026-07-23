using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinJobProfitSnapshot
{
    public Guid FinjobProfitId { get; set; }

    public Guid FinjobProfitJobId { get; set; }

    public Guid? FinjobProfitPeriodId { get; set; }

    public string FinjobProfitSnapshotTypeCode { get; set; } = null!;

    public decimal FinjobProfitRevenueAmount { get; set; }

    public decimal FinjobProfitCostAmount { get; set; }

    public decimal FinjobProfitWipamount { get; set; }

    public decimal FinjobProfitAccrualAmount { get; set; }

    public decimal FinjobProfitFxgainLossAmount { get; set; }

    public decimal FinjobProfitGrossProfitAmount { get; set; }

    public decimal? FinjobProfitGrossProfitPercent { get; set; }

    public string FinjobProfitCurrencyCodeSnapshot { get; set; } = null!;

    public DateTime FinjobProfitCalculatedAt { get; set; }

    public Guid? FinjobProfitCalculatedBy { get; set; }

    public virtual CmpUser? FinjobProfitCalculatedByNavigation { get; set; }

    public virtual JobHeader FinjobProfitJob { get; set; } = null!;

    public virtual FinPeriod? FinjobProfitPeriod { get; set; }
}
