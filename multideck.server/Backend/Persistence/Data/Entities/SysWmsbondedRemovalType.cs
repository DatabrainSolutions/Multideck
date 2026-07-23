using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbondedRemovalType
{
    public string WmsbondedRemovalTypeCode { get; set; } = null!;

    public string WmsbondedRemovalTypeName { get; set; } = null!;

    public string? WmsbondedRemovalTypeDescription { get; set; }

    public bool WmsbondedRemovalTypeRequiresDeclaration { get; set; }

    public bool WmsbondedRemovalTypeIsActive { get; set; }

    public int WmsbondedRemovalTypeSortOrder { get; set; }

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();
}
