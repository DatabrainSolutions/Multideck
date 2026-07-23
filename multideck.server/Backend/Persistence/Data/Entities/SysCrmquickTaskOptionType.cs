using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmquickTaskOptionType
{
    public string CrmquickOptTypeCode { get; set; } = null!;

    public string CrmquickOptTypeName { get; set; } = null!;

    public string? CrmquickOptTypeDescription { get; set; }

    public bool CrmquickOptTypeIsCommunication { get; set; }

    public bool CrmquickOptTypeIsActive { get; set; }

    public int CrmquickOptTypeSortOrder { get; set; }

    public virtual ICollection<CrmQuickTaskOption> CrmQuickTaskOptions { get; set; } = new List<CrmQuickTaskOption>();
}
