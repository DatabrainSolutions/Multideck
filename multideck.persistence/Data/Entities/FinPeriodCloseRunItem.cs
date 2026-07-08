using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinPeriodCloseRunItem
{
    public Guid FincloseItemId { get; set; }

    public Guid FincloseItemCloseRunId { get; set; }

    public string FincloseItemItemTypeCode { get; set; } = null!;

    public string? FincloseItemSourceTable { get; set; }

    public Guid? FincloseItemSourceId { get; set; }

    public Guid? FincloseItemJobId { get; set; }

    public string FincloseItemStatusCode { get; set; } = null!;

    public decimal FincloseItemAmount { get; set; }

    public decimal FincloseItemLocalAmount { get; set; }

    public string FincloseItemCurrencyCodeSnapshot { get; set; } = null!;

    public string? FincloseItemExplanation { get; set; }

    public string FincloseItemMetadataJson { get; set; } = null!;

    public virtual FinPeriodCloseRun FincloseItemCloseRun { get; set; } = null!;

    public virtual JobHeader? FincloseItemJob { get; set; }
}
