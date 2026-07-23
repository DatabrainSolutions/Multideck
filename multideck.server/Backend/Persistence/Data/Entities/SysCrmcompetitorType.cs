using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmcompetitorType
{
    public string CrmcompTypeCode { get; set; } = null!;

    public string CrmcompTypeName { get; set; } = null!;

    public string? CrmcompTypeDescription { get; set; }

    public bool CrmcompTypeIsActive { get; set; }

    public int CrmcompTypeSortOrder { get; set; }

    public virtual ICollection<CrmOpportunityCompetitor> CrmOpportunityCompetitors { get; set; } = new List<CrmOpportunityCompetitor>();
}
