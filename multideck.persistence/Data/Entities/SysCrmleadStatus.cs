using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmleadStatus
{
    public string CrmleadStatusCode { get; set; } = null!;

    public string CrmleadStatusName { get; set; } = null!;

    public string? CrmleadStatusDescription { get; set; }

    public bool CrmleadStatusIsOpen { get; set; }

    public bool CrmleadStatusIsConverted { get; set; }

    public bool CrmleadStatusIsDisqualified { get; set; }

    public bool CrmleadStatusIsActive { get; set; }

    public int CrmleadStatusSortOrder { get; set; }

    public DateTime CrmleadStatusCreatedAt { get; set; }

    public virtual ICollection<CrmLeadStatusHistory> CrmLeadStatusHistoryCrmleadStatusFromStatusCodeNavigations { get; set; } = new List<CrmLeadStatusHistory>();

    public virtual ICollection<CrmLeadStatusHistory> CrmLeadStatusHistoryCrmleadStatusToStatusCodeNavigations { get; set; } = new List<CrmLeadStatusHistory>();

    public virtual ICollection<CrmLead> CrmLeads { get; set; } = new List<CrmLead>();
}
