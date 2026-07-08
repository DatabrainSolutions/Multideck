using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmopportunityType
{
    public string CrmopptyTypeCode { get; set; } = null!;

    public string CrmopptyTypeName { get; set; } = null!;

    public string? CrmopptyTypeDescription { get; set; }

    public bool CrmopptyTypeIsRecurring { get; set; }

    public bool CrmopptyTypeIsActive { get; set; }

    public int CrmopptyTypeSortOrder { get; set; }

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();
}
