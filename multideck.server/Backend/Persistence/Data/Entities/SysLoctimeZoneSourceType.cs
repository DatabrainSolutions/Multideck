using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLoctimeZoneSourceType
{
    public string LoctzsourceCode { get; set; } = null!;

    public string LoctzsourceName { get; set; } = null!;

    public string? LoctzsourceDescription { get; set; }

    public bool LoctzsourceIsActive { get; set; }

    public int LoctzsourceSortOrder { get; set; }

    public virtual ICollection<LocDateTimeFieldRule> LocDateTimeFieldRules { get; set; } = new List<LocDateTimeFieldRule>();
}
