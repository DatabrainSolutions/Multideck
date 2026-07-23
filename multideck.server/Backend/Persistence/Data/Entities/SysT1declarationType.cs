using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysT1declarationType
{
    public string T1dtCode { get; set; } = null!;

    public string T1dtName { get; set; } = null!;

    public string? T1dtDescription { get; set; }

    public int T1dtSortOrder { get; set; }

    public bool T1dtIsActive { get; set; }

    public DateTime T1dtCreatedAt { get; set; }

    public virtual ICollection<T1Declaration> T1Declarations { get; set; } = new List<T1Declaration>();
}
