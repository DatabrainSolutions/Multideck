using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAiinsightTarget
{
    public Guid FinaitargetId { get; set; }

    public Guid FinaitargetInsightId { get; set; }

    public string FinaitargetTargetTable { get; set; } = null!;

    public Guid FinaitargetTargetId { get; set; }

    public string FinaitargetTargetRoleCode { get; set; } = null!;

    public decimal FinaitargetImpactAmount { get; set; }

    public string FinaitargetImpactCurrencyCode { get; set; } = null!;

    public string? FinaitargetImpactDescription { get; set; }

    public virtual FinAiinsight FinaitargetInsight { get; set; } = null!;
}
