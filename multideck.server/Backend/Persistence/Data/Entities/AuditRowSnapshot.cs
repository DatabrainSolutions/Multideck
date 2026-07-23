using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AuditRowSnapshot
{
    public Guid AuditSnapshotId { get; set; }

    public Guid AuditSnapshotEventId { get; set; }

    public string AuditSnapshotSnapshotType { get; set; } = null!;

    public string AuditSnapshotRowJson { get; set; } = null!;

    public string AuditSnapshotRowHash { get; set; } = null!;

    public bool AuditSnapshotIsRedacted { get; set; }

    public DateTime AuditSnapshotCreatedAt { get; set; }

    public virtual AuditEvent AuditSnapshotEvent { get; set; } = null!;
}
