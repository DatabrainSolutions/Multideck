using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmfocusAreaStatus
{
    public string CrmfocusStatusCode { get; set; } = null!;

    public string CrmfocusStatusName { get; set; } = null!;

    public string? CrmfocusStatusDescription { get; set; }

    public bool CrmfocusStatusIsClosed { get; set; }

    public bool CrmfocusStatusIsActive { get; set; }

    public int CrmfocusStatusSortOrder { get; set; }

    public virtual ICollection<CrmAifocusArea> CrmAifocusAreas { get; set; } = new List<CrmAifocusArea>();
}
