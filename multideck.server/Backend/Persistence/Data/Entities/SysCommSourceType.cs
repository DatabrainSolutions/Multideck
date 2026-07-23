using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommSourceType
{
    public string CommSourceTypeCode { get; set; } = null!;

    public string CommSourceTypeName { get; set; } = null!;

    public string? CommSourceTypeDescription { get; set; }

    public int CommSourceTypeSortOrder { get; set; }

    public bool CommSourceTypeIsActive { get; set; }

    public DateTime CommSourceTypeCreatedAt { get; set; }

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();
}
