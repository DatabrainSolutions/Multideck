using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class T1AuditLog
{
    public Guid T1auId { get; set; }

    public Guid? T1auT1id { get; set; }

    public string T1auAction { get; set; } = null!;

    public string? T1auTableName { get; set; }

    public Guid? T1auRecordId { get; set; }

    public Guid? T1auChangedBy { get; set; }

    public DateTime T1auChangedAt { get; set; }

    public string? T1auOldValues { get; set; }

    public string? T1auNewValues { get; set; }

    public string? T1auSource { get; set; }

    public string? T1auNotes { get; set; }

    public virtual T1Declaration? T1auT1 { get; set; }
}
