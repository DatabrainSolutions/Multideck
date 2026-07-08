using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinWipitem
{
    public Guid FinwipId { get; set; }

    public Guid? FinwipJobId { get; set; }

    public Guid? FinwipChargeOutId { get; set; }

    public Guid? FinwipPeriodId { get; set; }

    public string FinwipStatusCode { get; set; } = null!;

    public DateOnly FinwipAccountingDate { get; set; }

    public decimal FinwipExpectedAmount { get; set; }

    public decimal FinwipWipamount { get; set; }

    public decimal FinwipRelievedAmount { get; set; }

    public decimal FinwipLocalWipamount { get; set; }

    public string FinwipCurrencyCodeSnapshot { get; set; } = null!;

    public Guid? FinwipReversalPeriodId { get; set; }

    public DateTime FinwipCreatedAt { get; set; }

    public Guid? FinwipCreatedBy { get; set; }

    public virtual ICollection<FinPostingLine> FinPostingLines { get; set; } = new List<FinPostingLine>();

    public virtual JobCostingChargesOut? FinwipChargeOut { get; set; }

    public virtual CmpUser? FinwipCreatedByNavigation { get; set; }

    public virtual JobHeader? FinwipJob { get; set; }

    public virtual FinPeriod? FinwipPeriod { get; set; }

    public virtual FinPeriod? FinwipReversalPeriod { get; set; }
}
