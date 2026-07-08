using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinVarianceItem
{
    public Guid FinvarItemId { get; set; }

    public Guid FinvarItemCaseId { get; set; }

    public Guid? FinvarItemDocumentLineId { get; set; }

    public Guid? FinvarItemChargeInId { get; set; }

    public Guid? FinvarItemChargeOutId { get; set; }

    public decimal FinvarItemExpectedAmount { get; set; }

    public decimal FinvarItemActualAmount { get; set; }

    public decimal FinvarItemVarianceAmount { get; set; }

    public string? FinvarItemReason { get; set; }

    public virtual FinVarianceCase FinvarItemCase { get; set; } = null!;

    public virtual JobCostingChargesIn? FinvarItemChargeIn { get; set; }

    public virtual JobCostingChargesOut? FinvarItemChargeOut { get; set; }

    public virtual FinDocumentLine? FinvarItemDocumentLine { get; set; }
}
