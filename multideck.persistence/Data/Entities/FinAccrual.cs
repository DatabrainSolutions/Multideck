using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAccrual
{
    public Guid FinaccrualId { get; set; }

    public Guid? FinaccrualJobId { get; set; }

    public Guid? FinaccrualChargeInId { get; set; }

    public Guid? FinaccrualPeriodId { get; set; }

    public string FinaccrualStatusCode { get; set; } = null!;

    public DateOnly FinaccrualAccountingDate { get; set; }

    public decimal FinaccrualExpectedAmount { get; set; }

    public decimal FinaccrualAccruedAmount { get; set; }

    public decimal FinaccrualRelievedAmount { get; set; }

    public decimal FinaccrualLocalAccruedAmount { get; set; }

    public string FinaccrualCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? FinaccrualReversalPeriodId { get; set; }

    public DateTime FinaccrualCreatedAt { get; set; }

    public Guid? FinaccrualCreatedBy { get; set; }

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual JobCostingChargesIn? FinaccrualChargeIn { get; set; }

    public virtual CmpUser? FinaccrualCreatedByNavigation { get; set; }

    public virtual JobHeader? FinaccrualJob { get; set; }

    public virtual FinPeriod? FinaccrualPeriod { get; set; }

    public virtual FinPeriod? FinaccrualReversalPeriod { get; set; }
}
