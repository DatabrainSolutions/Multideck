using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB status transition audit history.
/// </summary>
public partial class AwbStatusHistory
{
    public Guid AwbshistId { get; set; }

    public Guid AwbshistAwbid { get; set; }

    public string? AwbshistFromStatus { get; set; }

    public string AwbshistToStatus { get; set; } = null!;

    public DateTime AwbshistChangedAt { get; set; }

    public Guid? AwbshistChangedBy { get; set; }

    public string? AwbshistReason { get; set; }

    public string? AwbshistSource { get; set; }

    public virtual AwbHeader AwbshistAwb { get; set; } = null!;

    public virtual SysAwbdocumentStatus? AwbshistFromStatusNavigation { get; set; }

    public virtual SysAwbdocumentStatus AwbshistToStatusNavigation { get; set; } = null!;
}
