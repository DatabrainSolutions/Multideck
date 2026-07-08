using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommThreadStatus
{
    public string CommThreadStatusCode { get; set; } = null!;

    public string CommThreadStatusName { get; set; } = null!;

    public string? CommThreadStatusDescription { get; set; }

    public bool CommThreadStatusIsFinal { get; set; }

    public int CommThreadStatusSortOrder { get; set; }

    public bool CommThreadStatusIsActive { get; set; }

    public DateTime CommThreadStatusCreatedAt { get; set; }

    public virtual ICollection<CommThread> CommThreads { get; set; } = new List<CommThread>();
}
