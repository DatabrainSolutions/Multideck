using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AcciSyncRun
{
    public Guid AccisrId { get; set; }

    public Guid AccisrConnectionId { get; set; }

    public string AccisrDirectionCode { get; set; } = null!;

    public string? AccisrDocumentTypeCode { get; set; }

    public string AccisrStatusCode { get; set; } = null!;

    public DateTime? AccisrStartedAt { get; set; }

    public DateTime? AccisrCompletedAt { get; set; }

    public int AccisrRecordsRead { get; set; }

    public int AccisrRecordsCreated { get; set; }

    public int AccisrRecordsUpdated { get; set; }

    public int AccisrRecordsFailed { get; set; }

    public string? AccisrCursorValue { get; set; }

    public string AccisrSettingsJson { get; set; } = null!;

    public DateTime AccisrCreatedAt { get; set; }

    public Guid? AccisrCreatedBy { get; set; }

    public virtual ICollection<AcciSyncEvent> AcciSyncEvents { get; set; } = new List<AcciSyncEvent>();

    public virtual AcciConnection AccisrConnection { get; set; } = null!;

    public virtual CmpUser? AccisrCreatedByNavigation { get; set; }

    public virtual SysAccountingDirection AccisrDirectionCodeNavigation { get; set; } = null!;

    public virtual SysAccountingDocumentType? AccisrDocumentTypeCodeNavigation { get; set; }

    public virtual SysAccountingSyncStatus AccisrStatusCodeNavigation { get; set; } = null!;
}
