using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// Immutable AWB snapshots for re-issue, amendment, and audit.
/// </summary>
public partial class AwbVersion
{
    public Guid AwbvId { get; set; }

    public Guid AwbvAwbid { get; set; }

    public int AwbvVersionNumber { get; set; }

    public string? AwbvStatus { get; set; }

    public string? AwbvChangeReason { get; set; }

    public string AwbvSnapshot { get; set; } = null!;

    public DateTime AwbvCreatedAt { get; set; }

    public Guid? AwbvCreatedBy { get; set; }

    public virtual AwbHeader AwbvAwb { get; set; } = null!;

    public virtual SysAwbdocumentStatus? AwbvStatusNavigation { get; set; }
}
