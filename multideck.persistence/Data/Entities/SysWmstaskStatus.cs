using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmstaskStatus
{
    public string WmstaskStatusCode { get; set; } = null!;

    public string WmstaskStatusName { get; set; } = null!;

    public string? WmstaskStatusDescription { get; set; }

    public bool WmstaskStatusIsOpen { get; set; }

    public bool WmstaskStatusIsFinal { get; set; }

    public bool WmstaskStatusIsActive { get; set; }

    public int WmstaskStatusSortOrder { get; set; }

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();
}
