using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommAipolicyRun
{
    public Guid CommAirunId { get; set; }

    public Guid CommAirunPolicyId { get; set; }

    public Guid? CommAirunThreadId { get; set; }

    public Guid? CommAirunMessageId { get; set; }

    public Guid? CommAirunTaskRunId { get; set; }

    public string CommAirunActionCode { get; set; } = null!;

    public string CommAirunStatusCode { get; set; } = null!;

    public decimal? CommAirunConfidence { get; set; }

    public bool CommAirunAutoSendAllowed { get; set; }

    public string? CommAirunAutoSendBlockedReason { get; set; }

    public string CommAirunInputJson { get; set; } = null!;

    public string CommAirunOutputJson { get; set; } = null!;

    public string? CommAirunErrorMessage { get; set; }

    public DateTime CommAirunStartedAt { get; set; }

    public DateTime? CommAirunCompletedAt { get; set; }

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();

    public virtual SysCommAiaction CommAirunActionCodeNavigation { get; set; } = null!;

    public virtual CommMessage? CommAirunMessage { get; set; }

    public virtual CommAiautomationPolicy CommAirunPolicy { get; set; } = null!;

    public virtual SysCommProcessingStatus CommAirunStatusCodeNavigation { get; set; } = null!;

    public virtual AiTaskRun? CommAirunTaskRun { get; set; }

    public virtual CommThread? CommAirunThread { get; set; }
}
