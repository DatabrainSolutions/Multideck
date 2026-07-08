using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmstaskType
{
    public string WmstaskTypeCode { get; set; } = null!;

    public string WmstaskTypeName { get; set; } = null!;

    public string? WmstaskTypeDescription { get; set; }

    public bool WmstaskTypeIsMobileTask { get; set; }

    public bool WmstaskTypeIsActive { get; set; }

    public int WmstaskTypeSortOrder { get; set; }

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();
}
