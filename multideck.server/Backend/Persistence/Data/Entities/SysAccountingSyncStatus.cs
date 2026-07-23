using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAccountingSyncStatus
{
    public string AccssCode { get; set; } = null!;

    public string AccssName { get; set; } = null!;

    public bool AccssIsFinal { get; set; }

    public int AccssSortOrder { get; set; }

    public bool AccssIsActive { get; set; }

    public DateTime AccssCreatedAt { get; set; }

    public virtual ICollection<AcciExportBatch> AcciExportBatches { get; set; } = new List<AcciExportBatch>();

    public virtual ICollection<AcciExportItem> AcciExportItems { get; set; } = new List<AcciExportItem>();

    public virtual ICollection<AcciExternalRef> AcciExternalRefs { get; set; } = new List<AcciExternalRef>();

    public virtual ICollection<AcciReconciliationIssue> AcciReconciliationIssues { get; set; } = new List<AcciReconciliationIssue>();

    public virtual ICollection<AcciSyncRun> AcciSyncRuns { get; set; } = new List<AcciSyncRun>();

    public virtual ICollection<AcciWebhookEvent> AcciWebhookEvents { get; set; } = new List<AcciWebhookEvent>();
}
