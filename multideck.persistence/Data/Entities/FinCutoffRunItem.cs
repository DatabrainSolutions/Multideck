using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinCutoffRunItem
{
    public Guid FincutoffItemId { get; set; }

    public Guid FincutoffItemCutoffId { get; set; }

    public string FincutoffItemItemTypeCode { get; set; } = null!;

    public Guid? FincutoffItemJobId { get; set; }

    public Guid? FincutoffItemChargeInId { get; set; }

    public Guid? FincutoffItemChargeOutId { get; set; }

    public Guid? FincutoffItemDocumentId { get; set; }

    public string FincutoffItemStatusCode { get; set; } = null!;

    public DateOnly FincutoffItemAccountingDate { get; set; }

    public decimal FincutoffItemAmount { get; set; }

    public decimal FincutoffItemLocalAmount { get; set; }

    public string FincutoffItemCurrencyCodeSnapshot { get; set; } = null!;

    public string? FincutoffItemExplanation { get; set; }

    public virtual JobCostingChargesIn? FincutoffItemChargeIn { get; set; }

    public virtual JobCostingChargesOut? FincutoffItemChargeOut { get; set; }

    public virtual FinCutoffRun FincutoffItemCutoff { get; set; } = null!;

    public virtual FinDocument? FincutoffItemDocument { get; set; }

    public virtual JobHeader? FincutoffItemJob { get; set; }
}
