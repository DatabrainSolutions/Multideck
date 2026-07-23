using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class IcusSubmissionEvent
{
    public Guid IcuseId { get; set; }

    public Guid IcuseSubmissionId { get; set; }

    public string IcuseEventType { get; set; } = null!;

    public string? IcuseEventStatus { get; set; }

    public string? IcuseEventCode { get; set; }

    public string? IcuseEventMessage { get; set; }

    public string IcuseEventPayloadJson { get; set; } = null!;

    public DateTime IcuseReceivedAt { get; set; }

    public DateTime IcuseCreatedAt { get; set; }

    public virtual IcusSubmission IcuseSubmission { get; set; } = null!;
}
