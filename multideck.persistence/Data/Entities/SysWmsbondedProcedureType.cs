using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbondedProcedureType
{
    public string WmsbondedProcedureTypeCode { get; set; } = null!;

    public string WmsbondedProcedureTypeName { get; set; } = null!;

    public string? WmsbondedProcedureTypeDescription { get; set; }

    public bool WmsbondedProcedureTypeIsDutySuspensive { get; set; }

    public bool WmsbondedProcedureTypeIsActive { get; set; }

    public int WmsbondedProcedureTypeSortOrder { get; set; }

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();
}
