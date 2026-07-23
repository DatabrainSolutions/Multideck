using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmGrowthSignal
{
    public Guid CrmgrowthId { get; set; }

    public Guid CrmgrowthAccountId { get; set; }

    public string CrmgrowthSignalType { get; set; } = null!;

    public string CrmgrowthTitle { get; set; } = null!;

    public string? CrmgrowthDescription { get; set; }

    public string? CrmgrowthModeCode { get; set; }

    public string? CrmgrowthTradeLane { get; set; }

    public decimal? CrmgrowthEstimatedValueAmount { get; set; }

    public string? CrmgrowthCurrencyCode { get; set; }

    public decimal? CrmgrowthConfidenceScore { get; set; }

    public string CrmgrowthStatus { get; set; } = null!;

    public Guid? CrmgrowthAitaskRunId { get; set; }

    public DateTime CrmgrowthCreatedAt { get; set; }

    public virtual CrmAccountProfile CrmgrowthAccount { get; set; } = null!;

    public virtual AiTaskRun? CrmgrowthAitaskRun { get; set; }
}
