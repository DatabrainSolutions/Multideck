using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmkpiresultStatus
{
    public string CrmkpistatusCode { get; set; } = null!;

    public string CrmkpistatusName { get; set; } = null!;

    public string? CrmkpistatusDescription { get; set; }

    public bool? CrmkpistatusIsGood { get; set; }

    public bool CrmkpistatusIsActive { get; set; }

    public int CrmkpistatusSortOrder { get; set; }

    public virtual ICollection<CrmKpiresult> CrmKpiresults { get; set; } = new List<CrmKpiresult>();
}
