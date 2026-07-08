using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBlidentifierType
{
    public string BlitCode { get; set; } = null!;

    public string BlitName { get; set; } = null!;

    public string? BlitDescription { get; set; }

    public int BlitSortOrder { get; set; }

    public virtual ICollection<BlIdentifier> BlIdentifiers { get; set; } = new List<BlIdentifier>();
}
