using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmforecastCategory
{
    public string CrmforecastCode { get; set; } = null!;

    public string CrmforecastName { get; set; } = null!;

    public string? CrmforecastDescription { get; set; }

    public bool CrmforecastIsIncluded { get; set; }

    public int CrmforecastSortOrder { get; set; }

    public bool CrmforecastIsActive { get; set; }

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();
}
