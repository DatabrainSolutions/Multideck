using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinRevaluationItem
{
    public Guid FinrevalItemId { get; set; }

    public Guid FinrevalItemRunId { get; set; }

    public Guid? FinrevalItemDocumentId { get; set; }

    public Guid? FinrevalItemCashId { get; set; }

    public decimal FinrevalItemOriginalLocalAmount { get; set; }

    public decimal FinrevalItemRevaluedLocalAmount { get; set; }

    public decimal FinrevalItemGainLossAmount { get; set; }

    public Guid? FinrevalItemRateId { get; set; }

    public string? FinrevalItemNotes { get; set; }

    public virtual ICollection<FinFxgainLossEvent> FinFxgainLossEvents { get; set; } = new List<FinFxgainLossEvent>();

    public virtual FinCashTransaction? FinrevalItemCash { get; set; }

    public virtual FinDocument? FinrevalItemDocument { get; set; }

    public virtual FinExchangeRate? FinrevalItemRate { get; set; }

    public virtual FinRevaluationRun FinrevalItemRun { get; set; } = null!;
}
