using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciSyncEvent
{
    public Guid AcciseId { get; set; }

    public Guid? AcciseSyncRunId { get; set; }

    public Guid AcciseConnectionId { get; set; }

    public string AcciseSeverity { get; set; } = null!;

    public string? AcciseEventCode { get; set; }

    public string AcciseMessage { get; set; } = null!;

    public string? AcciseLocalTable { get; set; }

    public Guid? AcciseLocalId { get; set; }

    public string? AcciseExternalObjectType { get; set; }

    public string? AcciseExternalId { get; set; }

    public string? AcciseRequestId { get; set; }

    public string AcciseRequestPayloadJson { get; set; } = null!;

    public string AcciseResponsePayloadJson { get; set; } = null!;

    public DateTime AcciseCreatedAt { get; set; }

    public virtual AcciConnection AcciseConnection { get; set; } = null!;

    public virtual AcciSyncRun? AcciseSyncRun { get; set; }
}
