using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommCallAioutput
{
    public Guid CommCallAiId { get; set; }

    public Guid CommCallAiCallId { get; set; }

    public Guid? CommCallAiAitaskRunId { get; set; }

    public string CommCallAiOutputType { get; set; } = null!;

    public string? CommCallAiTitle { get; set; }

    public string? CommCallAiSummary { get; set; }

    public string CommCallAiOutputJson { get; set; } = null!;

    public decimal? CommCallAiConfidenceScore { get; set; }

    public string? CommCallAiModelNameSnapshot { get; set; }

    public string? CommCallAiPromptVersion { get; set; }

    public DateTime CommCallAiCreatedAt { get; set; }

    public virtual ICollection<CommCallActionItem> CommCallActionItems { get; set; } = new List<CommCallActionItem>();

    public virtual AiTaskRun? CommCallAiAitaskRun { get; set; }

    public virtual CommCallLog CommCallAiCall { get; set; } = null!;
}
