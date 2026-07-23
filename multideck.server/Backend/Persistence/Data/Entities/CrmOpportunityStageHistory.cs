using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmOpportunityStageHistory
{
    public Guid CrmopptyStageId { get; set; }

    public Guid CrmopptyStageOpportunityId { get; set; }

    public string? CrmopptyStageFromStageCode { get; set; }

    public string CrmopptyStageToStageCode { get; set; } = null!;

    public decimal? CrmopptyStageProbabilityPct { get; set; }

    public string? CrmopptyStageReason { get; set; }

    public DateTime CrmopptyStageChangedAt { get; set; }

    public Guid? CrmopptyStageChangedBy { get; set; }

    public Guid? CrmopptyStageSourceAiTaskRunId { get; set; }

    public virtual CmpUser? CrmopptyStageChangedByNavigation { get; set; }

    public virtual SysCrmopportunityStage? CrmopptyStageFromStageCodeNavigation { get; set; }

    public virtual CrmOpportunity CrmopptyStageOpportunity { get; set; } = null!;

    public virtual AiTaskRun? CrmopptyStageSourceAiTaskRun { get; set; }

    public virtual SysCrmopportunityStage CrmopptyStageToStageCodeNavigation { get; set; } = null!;
}
