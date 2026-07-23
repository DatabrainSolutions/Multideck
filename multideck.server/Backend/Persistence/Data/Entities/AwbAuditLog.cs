using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB audit log for document, rating, charge, validation, and message changes.
/// </summary>
public partial class AwbAuditLog
{
    public Guid AwbauId { get; set; }

    public Guid? AwbauAwbid { get; set; }

    public string AwbauAction { get; set; } = null!;

    public string? AwbauTableName { get; set; }

    public Guid? AwbauRecordId { get; set; }

    public Guid? AwbauChangedBy { get; set; }

    public DateTime AwbauChangedAt { get; set; }

    public string? AwbauOldValues { get; set; }

    public string? AwbauNewValues { get; set; }

    public string? AwbauSource { get; set; }

    public string? AwbauNotes { get; set; }

    public virtual AwbHeader? AwbauAwb { get; set; }
}
