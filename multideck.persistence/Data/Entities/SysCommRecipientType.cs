using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommRecipientType
{
    public string CommRecipientTypeCode { get; set; } = null!;

    public string CommRecipientTypeName { get; set; } = null!;

    public string? CommRecipientTypeDescription { get; set; }

    public int CommRecipientTypeSortOrder { get; set; }

    public bool CommRecipientTypeIsActive { get; set; }

    public DateTime CommRecipientTypeCreatedAt { get; set; }

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();
}
