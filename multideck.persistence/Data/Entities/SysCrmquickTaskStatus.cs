using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmquickTaskStatus
{
    public string CrmquickTaskStatusCode { get; set; } = null!;

    public string CrmquickTaskStatusName { get; set; } = null!;

    public string? CrmquickTaskStatusDescription { get; set; }

    public bool CrmquickTaskStatusIsOpen { get; set; }

    public bool CrmquickTaskStatusIsDone { get; set; }

    public bool CrmquickTaskStatusIsActive { get; set; }

    public int CrmquickTaskStatusSortOrder { get; set; }

    public virtual ICollection<CrmQuickTask> CrmQuickTasks { get; set; } = new List<CrmQuickTask>();
}
