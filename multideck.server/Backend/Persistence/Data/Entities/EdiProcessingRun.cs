using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiProcessingRun
{
    public Guid EdirunId { get; set; }

    public Guid? EdirunMessageId { get; set; }

    public Guid? EdirunBatchId { get; set; }

    public string EdirunRunTypeCode { get; set; } = null!;

    public string EdirunStatusCode { get; set; } = null!;

    public Guid? EdirunAitaskRunId { get; set; }

    public string EdirunInputJson { get; set; } = null!;

    public string EdirunOutputJson { get; set; } = null!;

    public string? EdirunErrorText { get; set; }

    public DateTime EdirunStartedAt { get; set; }

    public DateTime? EdirunCompletedAt { get; set; }

    public Guid? EdirunCreatedBy { get; set; }

    public virtual ICollection<EdiProcessingEvent> EdiProcessingEvents { get; set; } = new List<EdiProcessingEvent>();

    public virtual AiTaskRun? EdirunAitaskRun { get; set; }

    public virtual EdiBatch? EdirunBatch { get; set; }

    public virtual CmpUser? EdirunCreatedByNavigation { get; set; }

    public virtual EdiMessage? EdirunMessage { get; set; }

    public virtual SysEdimessageStatus EdirunStatusCodeNavigation { get; set; } = null!;
}
