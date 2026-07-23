using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiProcessingEvent
{
    public Guid EdieventId { get; set; }

    public Guid? EdieventRunId { get; set; }

    public Guid? EdieventMessageId { get; set; }

    public Guid? EdieventBatchId { get; set; }

    public string EdieventEventTypeCode { get; set; } = null!;

    public string? EdieventStatusCode { get; set; }

    public string? EdieventEventText { get; set; }

    public string? EdieventProviderEventId { get; set; }

    public string EdieventEventJson { get; set; } = null!;

    public DateTime EdieventCreatedAt { get; set; }

    public Guid? EdieventCreatedBy { get; set; }

    public virtual EdiBatch? EdieventBatch { get; set; }

    public virtual CmpUser? EdieventCreatedByNavigation { get; set; }

    public virtual SysEdieventType EdieventEventTypeCodeNavigation { get; set; } = null!;

    public virtual EdiMessage? EdieventMessage { get; set; }

    public virtual EdiProcessingRun? EdieventRun { get; set; }

    public virtual SysEdimessageStatus? EdieventStatusCodeNavigation { get; set; }
}
