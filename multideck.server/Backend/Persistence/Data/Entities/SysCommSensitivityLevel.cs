using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommSensitivityLevel
{
    public string CommSensitivityCode { get; set; } = null!;

    public string CommSensitivityName { get; set; } = null!;

    public string? CommSensitivityDescription { get; set; }

    public int CommSensitivitySortOrder { get; set; }

    public bool CommSensitivityIsActive { get; set; }

    public DateTime CommSensitivityCreatedAt { get; set; }

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();

    public virtual ICollection<CommMessageTemplate> CommMessageTemplates { get; set; } = new List<CommMessageTemplate>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();
}
