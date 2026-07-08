using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommCallDirection
{
    public string CommCallDirectionCode { get; set; } = null!;

    public string CommCallDirectionName { get; set; } = null!;

    public string? CommCallDirectionDescription { get; set; }

    public int CommCallDirectionSortOrder { get; set; }

    public bool CommCallDirectionIsActive { get; set; }

    public DateTime CommCallDirectionCreatedAt { get; set; }

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();
}
