using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsscanEventType
{
    public string WmsscanEventTypeCode { get; set; } = null!;

    public string WmsscanEventTypeName { get; set; } = null!;

    public string? WmsscanEventTypeDescription { get; set; }

    public bool WmsscanEventTypeIsExceptionCandidate { get; set; }

    public bool WmsscanEventTypeIsActive { get; set; }

    public int WmsscanEventTypeSortOrder { get; set; }

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();
}
