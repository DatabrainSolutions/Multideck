using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiMessageLink
{
    public Guid AimlId { get; set; }

    public Guid AimlMessageId { get; set; }

    public string AimlTargetTable { get; set; } = null!;

    public Guid AimlTargetId { get; set; }

    public string? AimlLinkRole { get; set; }

    public DateTime AimlCreatedAt { get; set; }

    public virtual AiMessage AimlMessage { get; set; } = null!;
}
