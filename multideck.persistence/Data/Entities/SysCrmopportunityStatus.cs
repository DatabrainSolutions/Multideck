using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmopportunityStatus
{
    public string CrmopptyStatusCode { get; set; } = null!;

    public string CrmopptyStatusName { get; set; } = null!;

    public string? CrmopptyStatusDescription { get; set; }

    public bool CrmopptyStatusIsOpen { get; set; }

    public bool CrmopptyStatusIsActive { get; set; }

    public int CrmopptyStatusSortOrder { get; set; }

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();
}
