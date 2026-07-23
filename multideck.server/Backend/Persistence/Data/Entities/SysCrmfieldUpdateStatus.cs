using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmfieldUpdateStatus
{
    public string CrmfieldUpdateStatusCode { get; set; } = null!;

    public string CrmfieldUpdateStatusName { get; set; } = null!;

    public string? CrmfieldUpdateStatusDescription { get; set; }

    public bool CrmfieldUpdateStatusIsOpen { get; set; }

    public bool CrmfieldUpdateStatusIsApplied { get; set; }

    public bool CrmfieldUpdateStatusIsActive { get; set; }

    public int CrmfieldUpdateStatusSortOrder { get; set; }

    public virtual ICollection<CrmFieldUpdateQueue> CrmFieldUpdateQueues { get; set; } = new List<CrmFieldUpdateQueue>();
}
