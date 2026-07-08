using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmQuoteWinProbability
{
    public Guid CrmquoteWinId { get; set; }

    public Guid CrmquoteWinFollowupId { get; set; }

    public DateTime CrmquoteWinAsOfAt { get; set; }

    public decimal CrmquoteWinProbabilityPct { get; set; }

    public string CrmquoteWinRiskFactorsJson { get; set; } = null!;

    public string CrmquoteWinPositiveFactorsJson { get; set; } = null!;

    public Guid? CrmquoteWinAitaskRunId { get; set; }

    public virtual AiTaskRun? CrmquoteWinAitaskRun { get; set; }

    public virtual CrmQuoteFollowup CrmquoteWinFollowup { get; set; } = null!;
}
