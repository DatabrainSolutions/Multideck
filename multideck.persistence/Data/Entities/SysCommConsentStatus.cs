using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommConsentStatus
{
    public string CommConsentStatusCode { get; set; } = null!;

    public string CommConsentStatusName { get; set; } = null!;

    public string? CommConsentStatusDescription { get; set; }

    public bool CommConsentStatusIsBlock { get; set; }

    public int CommConsentStatusSortOrder { get; set; }

    public bool CommConsentStatusIsActive { get; set; }

    public DateTime CommConsentStatusCreatedAt { get; set; }

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommSuppressionList> CommSuppressionLists { get; set; } = new List<CommSuppressionList>();
}
