using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommCallStatus
{
    public string CommCallStatusCode { get; set; } = null!;

    public string CommCallStatusName { get; set; } = null!;

    public string? CommCallStatusDescription { get; set; }

    public bool CommCallStatusIsFinal { get; set; }

    public int CommCallStatusSortOrder { get; set; }

    public bool CommCallStatusIsActive { get; set; }

    public DateTime CommCallStatusCreatedAt { get; set; }

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();
}
