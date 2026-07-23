using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysBllocationRole
{
    public string BllrCode { get; set; } = null!;

    public string BllrName { get; set; } = null!;

    public string? BllrDescription { get; set; }

    public int BllrSortOrder { get; set; }

    public bool BllrAllowMultiple { get; set; }

    public bool BllrIsRequiredForIssue { get; set; }

    public virtual ICollection<BlLocation> BlLocations { get; set; } = new List<BlLocation>();
}
