using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysObsqueueStatus
{
    public string ObsqueueStatusCode { get; set; } = null!;

    public string ObsqueueStatusName { get; set; } = null!;

    public string? ObsqueueStatusDescription { get; set; }

    public bool ObsqueueStatusIsOpen { get; set; }

    public bool ObsqueueStatusIsActive { get; set; }

    public int ObsqueueStatusSortOrder { get; set; }

    public virtual ICollection<ObsDataQualityIssue> ObsDataQualityIssues { get; set; } = new List<ObsDataQualityIssue>();

    public virtual ICollection<ObsExceptionQueue> ObsExceptionQueues { get; set; } = new List<ObsExceptionQueue>();

    public virtual ICollection<ObsRetryQueue> ObsRetryQueues { get; set; } = new List<ObsRetryQueue>();

    public virtual ICollection<ObsWebhookInbox> ObsWebhookInboxes { get; set; } = new List<ObsWebhookInbox>();
}
