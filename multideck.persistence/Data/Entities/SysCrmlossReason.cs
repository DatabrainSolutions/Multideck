using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCrmlossReason
{
    public string CrmlossReasonCode { get; set; } = null!;

    public string CrmlossReasonName { get; set; } = null!;

    public string? CrmlossReasonDescription { get; set; }

    public bool CrmlossReasonIsControllable { get; set; }

    public bool CrmlossReasonIsActive { get; set; }

    public int CrmlossReasonSortOrder { get; set; }

    public virtual ICollection<CrmOpportunity> CrmOpportunities { get; set; } = new List<CrmOpportunity>();

    public virtual ICollection<CrmQuoteLostDetail> CrmQuoteLostDetails { get; set; } = new List<CrmQuoteLostDetail>();
}
