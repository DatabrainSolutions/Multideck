using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAccountingDocumentType
{
    public string AccdtCode { get; set; } = null!;

    public string AccdtName { get; set; } = null!;

    public string AccdtDirectionCode { get; set; } = null!;

    public string? AccdtDescription { get; set; }

    public int AccdtSortOrder { get; set; }

    public bool AccdtIsActive { get; set; }

    public DateTime AccdtCreatedAt { get; set; }

    public virtual SysAccountingDirection AccdtDirectionCodeNavigation { get; set; } = null!;

    public virtual ICollection<AcciExportItem> AcciExportItems { get; set; } = new List<AcciExportItem>();

    public virtual ICollection<AcciExternalRef> AcciExternalRefs { get; set; } = new List<AcciExternalRef>();

    public virtual ICollection<AcciSyncRun> AcciSyncRuns { get; set; } = new List<AcciSyncRun>();
}
