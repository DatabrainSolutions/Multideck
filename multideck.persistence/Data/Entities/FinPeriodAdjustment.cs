using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPeriodAdjustment
{
    public Guid FinperiodAdjId { get; set; }

    public Guid? FinperiodAdjSourceJobId { get; set; }

    public Guid? FinperiodAdjSourceChargeInId { get; set; }

    public Guid? FinperiodAdjSourceChargeOutId { get; set; }

    public Guid? FinperiodAdjSourceDocumentId { get; set; }

    public DateOnly FinperiodAdjOriginalAccountingDate { get; set; }

    public Guid? FinperiodAdjOriginalPeriodId { get; set; }

    public DateOnly FinperiodAdjPostingAccountingDate { get; set; }

    public Guid? FinperiodAdjPostingPeriodId { get; set; }

    public string FinperiodAdjAdjustmentTypeCode { get; set; } = null!;

    public string? FinperiodAdjReasonCode { get; set; }

    public decimal FinperiodAdjAmount { get; set; }

    public decimal FinperiodAdjLocalAmount { get; set; }

    public string FinperiodAdjCurrencyCodeSnapshot { get; set; } = null!;

    public bool FinperiodAdjHadPriorWipaccrual { get; set; }

    public DateTime FinperiodAdjCreatedAt { get; set; }

    public Guid? FinperiodAdjCreatedBy { get; set; }

    public virtual CmpUser? FinperiodAdjCreatedByNavigation { get; set; }

    public virtual FinPeriod? FinperiodAdjOriginalPeriod { get; set; }

    public virtual FinPeriod? FinperiodAdjPostingPeriod { get; set; }

    public virtual JobCostingChargesIn? FinperiodAdjSourceChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinperiodAdjSourceChargeOut { get; set; }

    public virtual JobHeader? FinperiodAdjSourceJob { get; set; }
}
