using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysLocpreferenceScopeType
{
    public string LocscopeTypeCode { get; set; } = null!;

    public string LocscopeTypeName { get; set; } = null!;

    public string? LocscopeTypeDescription { get; set; }

    public bool LocscopeTypeIsActive { get; set; }

    public int LocscopeTypeSortOrder { get; set; }

    public virtual ICollection<LocProfileScope> LocProfileScopes { get; set; } = new List<LocProfileScope>();
}
