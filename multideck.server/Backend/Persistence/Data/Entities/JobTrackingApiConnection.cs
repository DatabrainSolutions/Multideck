using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class JobTrackingApiConnection
{
    public Guid JobTrackConnId { get; set; }

    public Guid? JobTrackConnOrgOfficeId { get; set; }

    public string JobTrackConnName { get; set; } = null!;

    public string JobTrackConnProviderName { get; set; } = null!;

    public string JobTrackConnSourceType { get; set; } = null!;

    public string? JobTrackConnBaseUrl { get; set; }

    public string JobTrackConnAuthType { get; set; } = null!;

    public string? JobTrackConnClientId { get; set; }

    public string? JobTrackConnSecretRef { get; set; }

    public string? JobTrackConnWebhookSecretRef { get; set; }

    public bool JobTrackConnDefaultForOffice { get; set; }

    public bool JobTrackConnIsActive { get; set; }

    public string JobTrackConnSettingsJson { get; set; } = null!;

    public DateTime JobTrackConnCreatedAt { get; set; }

    public Guid? JobTrackConnCreatedBy { get; set; }

    public DateTime JobTrackConnUpdatedAt { get; set; }

    public Guid? JobTrackConnUpdatedBy { get; set; }

    public virtual CmpOffice? JobTrackConnOrgOffice { get; set; }

    public virtual SysJobTrackingSourceType JobTrackConnSourceTypeNavigation { get; set; } = null!;

    public virtual ICollection<JobTrackingSubscription> JobTrackingSubscriptions { get; set; } = new List<JobTrackingSubscription>();
}
