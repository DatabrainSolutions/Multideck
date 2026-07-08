using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommInboundEvent
{
    public Guid CommInboundId { get; set; }

    public Guid? CommInboundConnectionId { get; set; }

    public Guid? CommInboundMailboxId { get; set; }

    public string CommInboundChannelCode { get; set; } = null!;

    public string CommInboundProcessingStatusCode { get; set; } = null!;

    public string? CommInboundProviderEventId { get; set; }

    public string? CommInboundProviderMessageId { get; set; }

    public string? CommInboundDedupeKey { get; set; }

    public Guid? CommInboundLinkedThreadId { get; set; }

    public Guid? CommInboundLinkedMessageId { get; set; }

    public DateTime CommInboundReceivedAt { get; set; }

    public DateTime? CommInboundProcessingStartedAt { get; set; }

    public DateTime? CommInboundProcessedAt { get; set; }

    public string CommInboundPayloadJson { get; set; } = null!;

    public string? CommInboundRawStorageBucket { get; set; }

    public string? CommInboundRawStoragePath { get; set; }

    public string? CommInboundErrorMessage { get; set; }

    public DateTime CommInboundCreatedAt { get; set; }

    public virtual SysCommChannel CommInboundChannelCodeNavigation { get; set; } = null!;

    public virtual CommProviderConnection? CommInboundConnection { get; set; }

    public virtual CommMessage? CommInboundLinkedMessage { get; set; }

    public virtual CommThread? CommInboundLinkedThread { get; set; }

    public virtual CommMailbox? CommInboundMailbox { get; set; }

    public virtual SysCommProcessingStatus CommInboundProcessingStatusCodeNavigation { get; set; } = null!;
}
