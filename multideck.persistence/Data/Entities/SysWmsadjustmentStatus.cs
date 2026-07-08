using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsadjustmentStatus
{
    public string WmsadjustmentStatusCode { get; set; } = null!;

    public string WmsadjustmentStatusName { get; set; } = null!;

    public string? WmsadjustmentStatusDescription { get; set; }

    public bool WmsadjustmentStatusIsPosted { get; set; }

    public bool WmsadjustmentStatusIsFinal { get; set; }

    public bool WmsadjustmentStatusIsActive { get; set; }

    public int WmsadjustmentStatusSortOrder { get; set; }

    public virtual ICollection<WmsAdjustment> WmsAdjustments { get; set; } = new List<WmsAdjustment>();
}
