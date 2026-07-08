using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class IcusWebhookEvent
{
    public Guid IcuswhId { get; set; }

    public Guid? IcuswhApiConnectionId { get; set; }

    public string? IcuswhEventId { get; set; }

    public string? IcuswhEventType { get; set; }

    public bool? IcuswhSignatureVerified { get; set; }

    public string IcuswhRawHeadersJson { get; set; } = null!;

    public string IcuswhRawPayloadJson { get; set; } = null!;

    public DateTime? IcuswhProcessedAt { get; set; }

    public string? IcuswhProcessStatus { get; set; }

    public string? IcuswhProcessError { get; set; }

    public DateTime IcuswhReceivedAt { get; set; }

    public virtual IcusApiConnection? IcuswhApiConnection { get; set; }
}
