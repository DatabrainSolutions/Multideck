using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommProcessingStatus
{
    public string CommProcessingStatusCode { get; set; } = null!;

    public string CommProcessingStatusName { get; set; } = null!;

    public string? CommProcessingStatusDescription { get; set; }

    public bool CommProcessingStatusIsFinal { get; set; }

    public int CommProcessingStatusSortOrder { get; set; }

    public bool CommProcessingStatusIsActive { get; set; }

    public DateTime CommProcessingStatusCreatedAt { get; set; }

    public virtual ICollection<CommAipolicyRun> CommAipolicyRuns { get; set; } = new List<CommAipolicyRun>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();
}
