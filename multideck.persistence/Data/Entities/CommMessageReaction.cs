using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageReaction
{
    public Guid CommReactionId { get; set; }

    public Guid CommReactionMessageId { get; set; }

    public Guid CommReactionUserId { get; set; }

    public string CommReactionReactionCode { get; set; } = null!;

    public string? CommReactionReactionLabel { get; set; }

    public DateTime CommReactionCreatedAt { get; set; }

    public virtual CommMessage CommReactionMessage { get; set; } = null!;

    public virtual CmpUser CommReactionUser { get; set; } = null!;
}
