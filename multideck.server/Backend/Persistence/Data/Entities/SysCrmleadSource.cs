using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmleadSource
{
    public string CrmleadSourceCode { get; set; } = null!;

    public string CrmleadSourceName { get; set; } = null!;

    public string? CrmleadSourceDescription { get; set; }

    public bool CrmleadSourceIsActive { get; set; }

    public int CrmleadSourceSortOrder { get; set; }

    public DateTime CrmleadSourceCreatedAt { get; set; }

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();
}
