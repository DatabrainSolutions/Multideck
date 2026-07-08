using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmrelationshipStatus
{
    public string CrmrelStatusCode { get; set; } = null!;

    public string CrmrelStatusName { get; set; } = null!;

    public string? CrmrelStatusDescription { get; set; }

    public bool CrmrelStatusIsCustomer { get; set; }

    public bool CrmrelStatusIsLead { get; set; }

    public bool CrmrelStatusIsActive { get; set; }

    public int CrmrelStatusSortOrder { get; set; }

    public DateTime CrmrelStatusCreatedAt { get; set; }

    public virtual ICollection<CrmAccountProfile> CrmAccountProfiles { get; set; } = new List<CrmAccountProfile>();

    public virtual ICollection<OrgMaster> OrgMasters { get; set; } = new List<OrgMaster>();
}
