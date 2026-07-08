using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageHeader
{
    public Guid CommHeaderId { get; set; }

    public Guid CommHeaderMessageId { get; set; }

    public string CommHeaderName { get; set; } = null!;

    public string? CommHeaderValue { get; set; }

    public bool CommHeaderIsSensitive { get; set; }

    public DateTime CommHeaderCreatedAt { get; set; }

    public virtual CommMessage CommHeaderMessage { get; set; } = null!;
}
