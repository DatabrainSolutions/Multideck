using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommLinkType
{
    public string CommLinkTypeCode { get; set; } = null!;

    public string CommLinkTypeName { get; set; } = null!;

    public string? CommLinkTypeDescription { get; set; }

    public int CommLinkTypeSortOrder { get; set; }

    public bool CommLinkTypeIsActive { get; set; }

    public DateTime CommLinkTypeCreatedAt { get; set; }

    public virtual ICollection<CommExtractedEntity> CommExtractedEntities { get; set; } = new List<CommExtractedEntity>();

    public virtual ICollection<CommFederationSubscription> CommFederationSubscriptions { get; set; } = new List<CommFederationSubscription>();

    public virtual ICollection<CommMessageLink> CommMessageLinks { get; set; } = new List<CommMessageLink>();

    public virtual ICollection<CommNotification> CommNotifications { get; set; } = new List<CommNotification>();

    public virtual ICollection<CommThreadLink> CommThreadLinks { get; set; } = new List<CommThreadLink>();
}
