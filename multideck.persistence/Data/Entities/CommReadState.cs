using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommReadState
{
    public Guid CommReadId { get; set; }

    public Guid CommReadUserId { get; set; }

    public Guid CommReadThreadId { get; set; }

    public Guid? CommReadMessageId { get; set; }

    public DateTime? CommReadReadAt { get; set; }

    public bool CommReadIsMuted { get; set; }

    public bool CommReadIsStarred { get; set; }

    public bool CommReadIsArchived { get; set; }

    public DateTime? CommReadSnoozedUntil { get; set; }

    public DateTime CommReadUpdatedAt { get; set; }

    public virtual CommMessage? CommReadMessage { get; set; }

    public virtual CommThread CommReadThread { get; set; } = null!;

    public virtual CmpUser CommReadUser { get; set; } = null!;
}
