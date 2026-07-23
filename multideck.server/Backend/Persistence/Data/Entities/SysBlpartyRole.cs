using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBlpartyRole
{
    public string BlprCode { get; set; } = null!;

    public string BlprName { get; set; } = null!;

    public string? BlprDescription { get; set; }

    public int BlprSortOrder { get; set; }

    public bool BlprAllowMultiple { get; set; }

    public bool BlprIsRequiredForIssue { get; set; }

    public virtual ICollection<BlParty> BlParties { get; set; } = new List<BlParty>();
}
