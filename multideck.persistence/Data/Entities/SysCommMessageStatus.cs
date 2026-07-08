using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommMessageStatus
{
    public string CommMessageStatusCode { get; set; } = null!;

    public string CommMessageStatusName { get; set; } = null!;

    public string? CommMessageStatusDescription { get; set; }

    public bool CommMessageStatusIsFinal { get; set; }

    public int CommMessageStatusSortOrder { get; set; }

    public bool CommMessageStatusIsActive { get; set; }

    public DateTime CommMessageStatusCreatedAt { get; set; }

    public virtual ICollection<CommDeliveryEvent> CommDeliveryEvents { get; set; } = new List<CommDeliveryEvent>();

    public virtual ICollection<CommFederationEnvelope> CommFederationEnvelopes { get; set; } = new List<CommFederationEnvelope>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();
}
