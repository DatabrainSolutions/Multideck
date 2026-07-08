using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

/// <summary>
/// AWB lifecycle states used by AWB_Header.AWB_Status.
/// </summary>
public partial class SysAwbdocumentStatus
{
    public string AwbdsCode { get; set; } = null!;

    public string AwbdsName { get; set; } = null!;

    public string? AwbdsDescription { get; set; }

    public bool AwbdsIsFinal { get; set; }

    public int AwbdsSortOrder { get; set; }

    public bool AwbdsIsActive { get; set; }

    public DateTime AwbdsCreatedAt { get; set; }

    public virtual ICollection<AwbHeader> AwbHeaders { get; set; } = new List<AwbHeader>();

    public virtual ICollection<AwbStatusHistory> AwbStatusHistoryAwbshistFromStatusNavigations { get; set; } = new List<AwbStatusHistory>();

    public virtual ICollection<AwbStatusHistory> AwbStatusHistoryAwbshistToStatusNavigations { get; set; } = new List<AwbStatusHistory>();

    public virtual ICollection<AwbVersion> AwbVersions { get; set; } = new List<AwbVersion>();
}
