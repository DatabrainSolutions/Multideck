using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbondedDiscrepancyType
{
    public string WmsbondedDiscrepancyTypeCode { get; set; } = null!;

    public string WmsbondedDiscrepancyTypeName { get; set; } = null!;

    public string? WmsbondedDiscrepancyTypeDescription { get; set; }

    public bool WmsbondedDiscrepancyTypeRequiresCustomsReview { get; set; }

    public bool WmsbondedDiscrepancyTypeIsActive { get; set; }

    public int WmsbondedDiscrepancyTypeSortOrder { get; set; }

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();
}
